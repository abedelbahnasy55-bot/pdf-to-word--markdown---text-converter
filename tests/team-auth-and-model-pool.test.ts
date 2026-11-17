import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, afterEach } from 'vitest';
import { ThinkingLevel } from '@google/genai';
import { TeamAuthManager, resolvePublicUrlInfo } from '../server/teamAuth';
import {
  ModelPoolManager,
  isEligibleFreeCandidate,
  buildSafeThinkingConfig,
} from '../server/modelPool';

describe('TeamAuthManager & Public Share URL resolution', () => {
  const createdDirs: string[] = [];

  afterEach(() => {
    delete process.env.TEAM_ACCESS_CODE;
    for (const dir of createdDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    createdDirs.length = 0;
  });

  it('persists team passcode config to disk, verifies timing-safe tokens, and invalidates old tokens on revokeAllSessions', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'team-auth-test-'));
    createdDirs.push(tmpRoot);

    const auth1 = new TeamAuthManager(tmpRoot);
    expect(auth1.isLockEnabled()).toBe(false);

    auth1.updateConfig({ enabled: true, newCode: 'AZHAR-2026' });
    expect(auth1.isLockEnabled()).toBe(true);
    expect(auth1.verifyPasscode('AZHAR-2026')).toBe(true);
    expect(auth1.verifyPasscode('wrong-code')).toBe(false);

    const tokenBeforeRevoke = auth1.signSessionToken(30);
    expect(auth1.verifySessionToken(tokenBeforeRevoke)).toBe(true);
    expect(auth1.verifySessionToken(`${tokenBeforeRevoke}tampered`)).toBe(false);

    // Reload from disk with fresh instance
    const authReloaded = new TeamAuthManager(tmpRoot);
    expect(authReloaded.isLockEnabled()).toBe(true);
    expect(authReloaded.verifySessionToken(tokenBeforeRevoke)).toBe(true);

    // Revoking all sessions bumps sessionEpoch and invalidates old token immediately
    authReloaded.revokeAllSessions();
    expect(authReloaded.verifySessionToken(tokenBeforeRevoke)).toBe(false);
    const freshToken = authReloaded.signSessionToken(30);
    expect(authReloaded.verifySessionToken(freshToken)).toBe(true);
  });

  it('enforces TEAM_ACCESS_CODE env override and blocks brute-force attempts after 8 failures', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'team-auth-env-'));
    createdDirs.push(tmpRoot);
    process.env.TEAM_ACCESS_CODE = 'ENV-SECRET-99';

    const auth = new TeamAuthManager(tmpRoot);
    expect(auth.isLockEnabled()).toBe(true);
    expect(auth.isEnvManaged()).toBe(true);
    expect(auth.verifyPasscode('ENV-SECRET-99')).toBe(true);
    expect(auth.verifyPasscode('wrong')).toBe(false);
    expect(() => auth.updateConfig({ enabled: false })).toThrow();

    const testIp = '203.0.113.5';
    for (let i = 0; i < 8; i++) {
      expect(auth.checkRateLimit(testIp).allowed).toBe(true);
      auth.recordFailedAttempt(testIp);
    }
    const locked = auth.checkRateLimit(testIp);
    expect(locked.allowed).toBe(false);
    expect(locked.retryAfterSeconds).toBeGreaterThan(0);

    auth.clearFailedAttempts(testIp);
    expect(auth.checkRateLimit(testIp).allowed).toBe(true);
  });

  it('derives public ais-pre Share URL cleanly when accessed from ais-dev sandbox host', () => {
    const reqLike: any = {
      headers: {
        'x-forwarded-host': 'ais-dev-demo123-685461883733.europe-west2.run.app',
        'x-forwarded-proto': 'https',
      },
      get: () => 'localhost:3000',
      secure: true,
    };
    const info = resolvePublicUrlInfo(reqLike);
    expect(info.isDevPreviewHost).toBe(true);
    expect(info.sharedPublicOrigin).toBe(
      'https://ais-pre-demo123-685461883733.europe-west2.run.app'
    );
  });
});

describe('ModelPoolManager dynamic filtering, thinkingConfig & round-robin rotation', () => {
  it('filters strictly for active free-tier text/multimodal models and excludes deprecated/paid families', () => {
    expect(isEligibleFreeCandidate('gemini-4-hydrogen', ['generateContent'])).toBe(true);
    expect(isEligibleFreeCandidate('gemini-3.8-flash', ['generateContent'])).toBe(true);
    expect(isEligibleFreeCandidate('gemini-3.6-flash', ['generateContent'])).toBe(true);
    expect(isEligibleFreeCandidate('gemini-3-flash-preview', ['generateContent'])).toBe(true);
    expect(isEligibleFreeCandidate('gemini-3.1-flash-lite', ['generateContent'])).toBe(true);
    expect(isEligibleFreeCandidate('gemini-2.5-flash', ['generateContent'])).toBe(true);

    // Deprecated / paid-only / specialty excluded
    expect(isEligibleFreeCandidate('gemini-1.5-flash', ['generateContent'])).toBe(false);
    expect(isEligibleFreeCandidate('gemini-2.0-flash', ['generateContent'])).toBe(false);
    expect(isEligibleFreeCandidate('gemini-4-argon', ['generateContent'])).toBe(false);
    expect(isEligibleFreeCandidate('gemini-4-carbon', ['generateContent'])).toBe(false);
    expect(isEligibleFreeCandidate('gemini-3-pro-image', ['generateContent'])).toBe(false);
    expect(isEligibleFreeCandidate('gemini-3.1-flash-image', ['generateContent'])).toBe(false);
    expect(isEligibleFreeCandidate('gemini-2.5-flash-image', ['generateContent'])).toBe(false);
    expect(isEligibleFreeCandidate('lyria-3-pro-preview', ['generateContent'])).toBe(false);
    expect(isEligibleFreeCandidate('gemini-embedding-2', ['embedContent'])).toBe(false);
  });

  it('builds valid model-specific thinkingConfig without sending thinkingLevel to pre-3 models', () => {
    expect(buildSafeThinkingConfig('gemini-4-hydrogen')).toEqual({
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    });
    expect(buildSafeThinkingConfig('gemini-3.8-flash')).toEqual({
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    });
    expect(buildSafeThinkingConfig('gemini-3.7-flash')).toEqual({
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    });
    expect(buildSafeThinkingConfig('gemini-3.1-flash-lite')).toEqual({
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
    });
    expect(buildSafeThinkingConfig('gemini-2.5-flash')).toEqual({});
  });

  it('rotates round-robin across healthy discovered models and excludes paid/404/cooldown models', async () => {
    const pool = new ModelPoolManager();
    const fakeAi: any = {
      models: {
        list: async () =>
          (async function* () {
            yield { name: 'models/gemini-4-hydrogen', supportedActions: ['generateContent'] };
            yield { name: 'models/gemini-3.8-flash', supportedActions: ['generateContent'] };
            yield { name: 'models/gemini-3.1-flash-lite', supportedActions: ['generateContent'] };
            yield { name: 'models/gemini-4-argon', supportedActions: ['generateContent'] };
            yield { name: 'models/gemini-2.0-flash', supportedActions: ['generateContent'] };
          })(),
        generateContent: async ({ model }: { model: string }) => {
          if (model === 'gemini-3.8-flash') {
            throw new Error('404 NOT_FOUND model not available');
          }
          return { text: '1' };
        },
      },
    };

    const prevKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'dummy-key-for-mock';
    try {
      await pool.discoverAndVerify(fakeAi, { probeActive: true });
    } finally {
      if (prevKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = prevKey;
    }

    const candidates1 = pool.getCandidateModels();
    const candidates2 = pool.getCandidateModels();
    expect(candidates1).toContain('gemini-4-hydrogen');
    expect(candidates1).toContain('gemini-3.1-flash-lite');
    expect(candidates1).not.toContain('gemini-3.8-flash'); // excluded on 404
    expect(candidates1).not.toContain('gemini-4-argon'); // excluded paid-only
    expect(candidates1).not.toContain('gemini-2.0-flash'); // excluded deprecated
    // Round-robin shifts starting model between consecutive calls
    expect(candidates1[0]).not.toBe(candidates2[0]);
  });
});
