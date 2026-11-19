import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import express from 'express';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { BackgroundJobManager } from '../server/backgroundJobManager';
import { registerTeamAuth } from '../server/teamAuth';
import {
  apiCorsMiddleware,
  securityHeadersMiddleware,
} from '../server/middleware/errorHandlers';
import { registerInfoAndCliRoutes } from '../server/controllers/infoAndCliRoutes';
import { documentStructuralAuditor } from '../src/utils/documentStructuralAuditor';
import { runContextualChecker } from '../src/utils/contextualChecker';
import { runGrammarSyntaxAnalyzer } from '../src/utils/grammarSyntaxAnalyzer';

const tempDirs: string[] = [];

afterEach(() => {
  delete process.env.TEAM_ACCESS_CODE;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
});

describe('Security & Path-Traversal Regressions', () => {
  it('rejects empty, traversal, and malformed job IDs without deleting .jobs root or sibling files', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-job-sec-'));
    tempDirs.push(tmpRoot);

    const manager = new BackgroundJobManager(tmpRoot, () => ({} as any));
    const jobsRoot = path.join(tmpRoot, '.jobs');
    const siblingAuthFile = path.join(jobsRoot, 'team_auth.json');
    fs.writeFileSync(siblingAuthFile, JSON.stringify({ enabled: true }), 'utf-8');

    const badIds = ['', '   ', '.', '..', '../..', '../team_auth.json', '$$$', 'job/nested', 'a\\b'];
    for (const badId of badIds) {
      expect(manager.getJobResult(badId)).toBeNull();
      expect(manager.getJobDetail(badId)).toEqual({
        meta: null,
        result: null,
        partialMarkdown: '',
      });
      expect(manager.pauseOrCancelJob(badId)).toBeNull();
      expect(manager.resumeJob(badId)).toBeNull();
      expect(manager.deleteJob(badId)).toBe(false);
    }

    expect(fs.existsSync(jobsRoot)).toBe(true);
    expect(fs.existsSync(siblingAuthFile)).toBe(true);
  });

  it('enforces team auth on /api/info, reflects Origin on CORS requests, and sets security headers', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'team-auth-http-'));
    tempDirs.push(tmpRoot);

    const app = express();
    app.use(securityHeadersMiddleware);
    app.use('/api', apiCorsMiddleware);
    app.use(express.json());
    const authManager = registerTeamAuth(app, tmpRoot);
    registerInfoAndCliRoutes(app, tmpRoot);

    authManager.updateConfig({ enabled: true, newCode: 'TEAM-5588' });

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address() as { port: number };
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    try {
      // 1. Exempt routes remain accessible and include hardening + Origin-reflected CORS headers
      const pingRes = await fetch(`${baseUrl}/api/ping`, {
        headers: { Origin: 'https://client.example' },
      });
      expect(pingRes.status).toBe(200);
      expect(pingRes.headers.get('x-content-type-options')).toBe('nosniff');
      expect(pingRes.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
      expect(pingRes.headers.get('x-frame-options')).toBe('SAMEORIGIN');
      expect(pingRes.headers.get('access-control-allow-origin')).toBe('https://client.example');
      expect(pingRes.headers.get('access-control-allow-credentials')).toBe('true');

      // 2. Non-Origin requests fall back to wildcard ACAO without credentials
      const noOriginRes = await fetch(`${baseUrl}/api/health`);
      expect(noOriginRes.status).toBe(200);
      expect(noOriginRes.headers.get('access-control-allow-origin')).toBe('*');
      expect(noOriginRes.headers.get('access-control-allow-credentials')).toBeNull();

      // 3. /api/info is protected when Team Lock is enabled
      const unauthInfo = await fetch(`${baseUrl}/api/info`);
      expect(unauthInfo.status).toBe(401);
      const unauthBody = (await unauthInfo.json()) as any;
      expect(unauthBody.authRequired).toBe(true);

      // 4. Verifying passcode grants X-Team-Session token that unlocks /api/info
      const verifyRes = await fetch(`${baseUrl}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'TEAM-5588', rememberDevice: true }),
      });
      expect(verifyRes.status).toBe(200);
      const verifyJson = (await verifyRes.json()) as any;
      expect(verifyJson.sessionToken).toBeTruthy();

      const authInfo = await fetch(`${baseUrl}/api/info`, {
        headers: { 'x-team-session': verifyJson.sessionToken },
      });
      expect(authInfo.status).toBe(200);
      const infoJson = (await authInfo.json()) as any;
      expect(infoJson.convertPdfContract?.limits?.magicByteValidation).toContain('WEBP');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe('Structural Auditor & Timer Cleanup Regressions', () => {
  it('safely calibrates TOC headings containing regex metacharacters and dollar replacement tokens', async () => {
    const md = [
      '# فهرس المحتويات',
      '',
      '| الموضوع | رقم الصفحة |',
      '| --- | --- |',
      '| الدرس [1] ($& القواعد + النحو) | 99 |',
      '',
      '---PAGE_BREAK---',
      '',
      'مقدمة الكتاب وتمهيد الدرس.',
      '',
      '---PAGE_BREAK---',
      '',
      '## الدرس [1] ($& القواعد + النحو)',
      'نص الدرس مع رمز $1 و $& للتأكد من عدم التلف.',
    ].join('\n');

    const { report, repairedMarkdown } = await documentStructuralAuditor(md);
    expect(report.totalIssuesCount).toBeGreaterThanOrEqual(1);
    expect(repairedMarkdown).toContain('## الدرس [1] ($& القواعد + النحو)');
    expect(repairedMarkdown).toContain('نص الدرس مع رمز $1 و $& للتأكد من عدم التلف.');
    expect(repairedMarkdown).toContain('| الدرس [1] ($& القواعد + النحو) | 4 |\n');
  });

  it('clears timeout timers via finally when contextualChecker or grammarSyntaxAnalyzer network calls reject', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Simulated network failure'))
    );

    const callsBeforeContext = clearSpy.mock.calls.length;
    // Unbalanced Quranic bracket triggers the server contextual check path
    const contextRes = await runContextualChecker(
      'قال تعالى: ﴿إن العلم نور يهدي الطلاب في كل مكان.',
      undefined,
      5000
    );
    expect(contextRes.isAiVerified).toBe(false);
    expect(clearSpy.mock.calls.length).toBeGreaterThan(callsBeforeContext);

    const callsBeforeGrammar = clearSpy.mock.calls.length;
    const grammarRes = await runGrammarSyntaxAnalyzer(
      'يقرأ الطالب الكتاب في المكتبة العامةصباح كل يوم مع زملائه.',
      'sample.pdf',
      5000
    );
    expect(grammarRes.repairedMarkdown.length).toBeGreaterThan(0);
    expect(clearSpy.mock.calls.length).toBeGreaterThan(callsBeforeGrammar);
  });
});
