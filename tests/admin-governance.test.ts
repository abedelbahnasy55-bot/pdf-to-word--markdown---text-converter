import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import express from 'express';
import { describe, it, expect, afterEach } from 'vitest';
import {
  GovernanceManager,
  registerGovernanceRoutes,
} from '../server/governanceManager';
import { registerTeamAuth } from '../server/teamAuth';
import {
  apiCorsMiddleware,
  securityHeadersMiddleware,
} from '../server/middleware/errorHandlers';
import { buildDashboardMetrics } from '../src/components/admin/dashboardMetrics';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
});

describe('GovernanceManager Persistence, User Controls & Telemetry', () => {
  it('tracks users, updates conversion lifecycle without duplicate counts, and enforces IP-matched blocks', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-unit-'));
    tempDirs.push(tmpRoot);

    const manager = new GovernanceManager(tmpRoot);
    const userA = {
      clientId: 'usr_alpha111',
      ip: '203.0.113.10',
      userAgent: 'Mozilla/5.0 Chrome/125.0 Windows NT 10.0',
      deviceLabel: 'Chrome · Windows',
      fromExplicitHeader: true,
    };
    const userB = {
      clientId: 'usr_incognito222',
      ip: '203.0.113.10',
      userAgent: 'Mozilla/5.0 Chrome/125.0 Windows NT 10.0',
      deviceLabel: 'Chrome · Windows',
      fromExplicitHeader: true,
    };

    manager.touchUser(userA, true);

    // Lifecycle update by jobId: started -> completed updates 1 log row cleanly
    manager.recordConversionEvent({
      jobId: 'job_test_1',
      clientId: userA.clientId,
      ip: userA.ip,
      deviceLabel: userA.deviceLabel,
      fileName: 'كتاب النحو.pdf',
      fileSize: 2_048_000,
      operation: 'background-job',
      status: 'started',
      pagesCount: 0,
      startedAt: Date.now() - 3000,
    });
    manager.recordConversionEvent({
      jobId: 'job_test_1',
      clientId: userA.clientId,
      ip: userA.ip,
      deviceLabel: userA.deviceLabel,
      fileName: 'كتاب النحو.pdf',
      fileSize: 2_048_000,
      operation: 'background-job',
      status: 'completed',
      pagesCount: 42,
      wordsCount: 8500,
      charsCount: 49000,
      extractionMethod: 'direct_digital_extraction',
      durationMs: 3100,
    });

    const overview1 = manager.getAdminOverview();
    expect(overview1.logs.length).toBe(1);
    expect(overview1.summary.totalConversions).toBe(1);
    expect(overview1.summary.completedConversions).toBe(1);
    expect(overview1.summary.totalPagesConverted).toBe(42);
    expect(overview1.users[0].totalPagesConverted).toBe(42);
    expect(overview1.users[0].todayPages).toBe(42);

    // Restrict userA from site with custom message AND block matching IP
    manager.updateUserControls(userA.clientId, {
      displayName: 'مستخدم اختبار',
      accessMode: 'block_site',
      customBlockMessage: 'تم إيقاف دخولك مؤقتاً لحين مراجعة الإدارة.',
      blockMatchingIpToo: true,
    });

    // Reload fresh manager from disk to verify atomic persistence
    const reloaded = new GovernanceManager(tmpRoot);
    const policyA = reloaded.evaluatePolicy(userA);
    expect(policyA.siteEnabled).toBe(false);
    expect(policyA.conversionsEnabled).toBe(false);
    expect(policyA.siteBlockMessage).toBe('تم إيقاف دخولك مؤقتاً لحين مراجعة الإدارة.');

    // Incognito browser from same IP is also caught by blockMatchingIpToo
    const policyB = reloaded.evaluatePolicy(userB);
    expect(policyB.siteEnabled).toBe(false);
    expect(policyB.matchedByIp).toBe(true);
    expect(policyB.siteBlockMessage).toBe('تم إيقاف دخولك مؤقتاً لحين مراجعة الإدارة.');

    // Another IP remains completely unaffected
    const policyC = reloaded.evaluatePolicy({
      clientId: 'usr_other333',
      ip: '198.51.100.77',
      userAgent: 'Safari',
      deviceLabel: 'Safari · iOS',
      fromExplicitHeader: true,
    });
    expect(policyC.siteEnabled).toBe(true);
    expect(policyC.conversionsEnabled).toBe(true);
  });

  it('enforces daily page quota and supports quota reset', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-quota-'));
    tempDirs.push(tmpRoot);
    const manager = new GovernanceManager(tmpRoot);

    manager.updateSiteControls({
      globalLimits: {
        dailyPageQuotaPerUser: 50,
      },
    });

    const user = {
      clientId: 'usr_quota1',
      ip: '198.51.100.5',
      userAgent: 'Chrome',
      deviceLabel: 'Chrome · Linux',
      fromExplicitHeader: true,
    };

    manager.recordConversionEvent({
      clientId: user.clientId,
      ip: user.ip,
      deviceLabel: user.deviceLabel,
      fileName: 'part1.pdf',
      operation: 'client-pipeline',
      status: 'completed',
      pagesCount: 55,
    });

    const denied = manager.checkActionAllowed(user, 'convert', { fileName: 'part2.pdf' });
    expect(denied.allowed).toBe(false);
    expect(denied.blockScope).toBe('quota');

    manager.updateUserControls(user.clientId, { resetTodayQuota: true });
    const allowedAgain = manager.checkActionAllowed(user, 'convert', { fileName: 'part2.pdf' });
    expect(allowedAgain.allowed).toBe(true);
  });
});

describe('Governance HTTP Enforcement & Admin API', () => {
  it('enforces global pause, per-user conversion/site blocks, and feature toggles while keeping /api/admin/* open', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-http-'));
    tempDirs.push(tmpRoot);

    const app = express();
    app.use(securityHeadersMiddleware);
    app.use('/api', apiCorsMiddleware);
    app.use(express.json());
    registerTeamAuth(app, tmpRoot);
    registerGovernanceRoutes(app, tmpRoot);

    // Dummy downstream handlers matching real endpoints
    app.post('/api/convert-pdf', (_req, res) => res.json({ success: true, data: {} }));
    app.post('/api/extract-direct-pdf', (_req, res) => res.json({ success: true, data: {} }));
    app.post('/api/export-docx', (_req, res) => res.json({ success: true }));
    app.post('/api/compiler/plan', (_req, res) => res.json({ success: true }));

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address() as { port: number };
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    try {
      // 1. Visitor checks policy and registers presence
      const policyRes1 = await fetch(`${baseUrl}/api/client/policy`, {
        headers: {
          'X-Client-Id': 'usr_student01',
          'X-Client-Device': encodeURIComponent('Chrome · Windows'),
        },
      });
      expect(policyRes1.status).toBe(200);
      const policyBody1 = (await policyRes1.json()) as any;
      expect(policyBody1.policy.siteEnabled).toBe(true);
      expect(policyBody1.policy.conversionsEnabled).toBe(true);

      // 2. Admin pauses all conversions globally with a custom message
      const pauseRes = await fetch(`${baseUrl}/api/admin/controls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversionsEnabled: false,
          conversionsPausedMessage: 'تم إيقاف التحويل مؤقتاً بواسطة المشرف حتى الساعة 5 مساءً.',
          featureFlags: {
            allowDocxExport: false,
          },
        }),
      });
      expect(pauseRes.status).toBe(200);

      // Blocked conversion returns 403 with exact custom admin message
      const convBlocked = await fetch(`${baseUrl}/api/convert-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Id': 'usr_student01',
        },
        body: JSON.stringify({ filename: 'test.pdf', pdfBase64: 'AAAA' }),
      });
      expect(convBlocked.status).toBe(403);
      const convBlockedJson = (await convBlocked.json()) as any;
      expect(convBlockedJson.blocked).toBe(true);
      expect(convBlockedJson.error).toBe(
        'تم إيقاف التحويل مؤقتاً بواسطة المشرف حتى الساعة 5 مساءً.'
      );

      // Blocked DOCX export returns 403
      const docxBlocked = await fetch(`${baseUrl}/api/export-docx`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Id': 'usr_student01',
        },
        body: JSON.stringify({ markdown: 'hi' }),
      });
      expect(docxBlocked.status).toBe(403);

      // 3. Re-enable conversions & DOCX, then block only usr_student01 from conversions
      await fetch(`${baseUrl}/api/admin/controls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversionsEnabled: true,
          siteEnabled: false,
          siteDisabledMessage: 'الموقع مغلق للصيانة العامة.',
          featureFlags: { allowDocxExport: true },
        }),
      });

      // Even with global site lock active, /api/admin/overview & /api/admin/controls remain accessible
      const adminOverviewRes = await fetch(`${baseUrl}/api/admin/overview`, {
        headers: { 'X-Client-Id': 'usr_student01' },
      });
      expect(adminOverviewRes.status).toBe(200);
      const overviewJson = (await adminOverviewRes.json()) as any;
      expect(overviewJson.summary.blockedAttempts).toBeGreaterThanOrEqual(2);
      expect(overviewJson.logs.some((l: any) => l.status === 'blocked')).toBe(true);

      // Unlock site, apply block_site to usr_student01 specifically
      await fetch(`${baseUrl}/api/admin/controls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteEnabled: true }),
      });
      await fetch(`${baseUrl}/api/admin/users/usr_student01`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessMode: 'block_site',
          customBlockMessage: 'تم إغلاق الموقع عن حسابك لمخالفة التعليمات.',
        }),
      });

      const blockedUserPolicyRes = await fetch(`${baseUrl}/api/client/policy`, {
        headers: { 'X-Client-Id': 'usr_student01' },
      });
      const blockedUserPolicy = (await blockedUserPolicyRes.json()) as any;
      expect(blockedUserPolicy.policy.siteEnabled).toBe(false);
      expect(blockedUserPolicy.policy.siteBlockMessage).toBe(
        'تم إغلاق الموقع عن حسابك لمخالفة التعليمات.'
      );

      // Different user still works normally
      const healthyRes = await fetch(`${baseUrl}/api/extract-direct-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Id': 'usr_student02',
        },
        body: JSON.stringify({ filename: 'book.pdf', pdfBase64: 'AAAA' }),
      });
      expect(healthyRes.status).toBe(200);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe('AdminDashboardTab Recharts Metrics Builder', () => {
  it('computes continuous daily series, top users ranking, and success rates accurately', () => {
    const fixedNow = new Date('2026-11-19T12:00:00.000Z').getTime();
    const oneDayMs = 86_400_000;

    const metrics = buildDashboardMetrics({
      windowDays: 7,
      topUsersSort: 'conversions',
      now: fixedNow,
      summary: {
        totalUsers: 2,
        onlineRecentlyCount: 1,
        blockedUsersCount: 0,
        totalConversions: 5,
        completedConversions: 3,
        failedConversions: 1,
        blockedAttempts: 1,
        totalPagesConverted: 45,
        todayConversions: 2,
        todayPages: 25,
      },
      users: [
        {
          clientId: 'u_top',
          displayName: 'أحمد',
          adminNote: '',
          firstSeenAt: fixedNow - 3 * oneDayMs,
          lastSeenAt: fixedNow,
          lastIp: '1.1.1.1',
          knownIps: ['1.1.1.1'],
          userAgent: 'Chrome',
          deviceLabel: 'Chrome · Windows',
          accessMode: 'active',
          customBlockMessage: '',
          customDailyPageLimit: 0,
          blockMatchingIpToo: false,
          totalConversions: 3,
          completedConversions: 2,
          failedConversions: 1,
          blockedAttempts: 0,
          totalPagesConverted: 15,
          lastFileName: 'b.pdf',
          lastActivityAt: fixedNow,
          todayConversions: 1,
          todayPages: 5,
        },
        {
          clientId: 'u_heavy_pages',
          displayName: 'فاطمة',
          adminNote: '',
          firstSeenAt: fixedNow - oneDayMs,
          lastSeenAt: fixedNow,
          lastIp: '2.2.2.2',
          knownIps: ['2.2.2.2'],
          userAgent: 'Safari',
          deviceLabel: 'Safari · macOS',
          accessMode: 'active',
          customBlockMessage: '',
          customDailyPageLimit: 0,
          blockMatchingIpToo: false,
          totalConversions: 2,
          completedConversions: 1,
          failedConversions: 0,
          blockedAttempts: 1,
          totalPagesConverted: 30,
          lastFileName: 'book.pdf',
          lastActivityAt: fixedNow,
          todayConversions: 1,
          todayPages: 20,
        },
      ],
      logs: [
        {
          id: 'l1',
          clientId: 'u_top',
          ip: '1.1.1.1',
          deviceLabel: 'Chrome · Windows',
          fileName: 'a.pdf',
          fileSize: 1000,
          mimeType: 'application/pdf',
          operation: 'direct-extract',
          status: 'completed',
          pagesCount: 10,
          wordsCount: 500,
          charsCount: 3000,
          extractionMethod: 'direct_digital_extraction',
          durationMs: 900,
          startedAt: fixedNow - 2 * oneDayMs,
        },
        {
          id: 'l2',
          clientId: 'u_top',
          ip: '1.1.1.1',
          deviceLabel: 'Chrome · Windows',
          fileName: 'b.pdf',
          fileSize: 1000,
          mimeType: 'application/pdf',
          operation: 'convert-pdf',
          status: 'failed',
          pagesCount: 0,
          wordsCount: 0,
          charsCount: 0,
          extractionMethod: 'ocr_batches',
          durationMs: 1200,
          startedAt: fixedNow - oneDayMs,
        },
        {
          id: 'l3',
          clientId: 'u_top',
          ip: '1.1.1.1',
          deviceLabel: 'Chrome · Windows',
          fileName: 'c.pdf',
          fileSize: 1000,
          mimeType: 'application/pdf',
          operation: 'convert-pdf',
          status: 'completed',
          pagesCount: 5,
          wordsCount: 200,
          charsCount: 1200,
          extractionMethod: 'ocr_batches',
          durationMs: 1500,
          startedAt: fixedNow,
        },
        {
          id: 'l4',
          clientId: 'u_heavy_pages',
          ip: '2.2.2.2',
          deviceLabel: 'Safari · macOS',
          fileName: 'book.pdf',
          fileSize: 5000,
          mimeType: 'application/pdf',
          operation: 'background-job',
          status: 'completed',
          pagesCount: 30,
          wordsCount: 4000,
          charsCount: 22000,
          extractionMethod: 'hybrid_digital_ocr',
          durationMs: 5000,
          startedAt: fixedNow,
        },
        {
          id: 'l5',
          clientId: 'u_heavy_pages',
          ip: '2.2.2.2',
          deviceLabel: 'Safari · macOS',
          fileName: 'huge.pdf',
          fileSize: 999999,
          mimeType: 'application/pdf',
          operation: 'convert-pdf',
          status: 'blocked',
          pagesCount: 0,
          wordsCount: 0,
          charsCount: 0,
          extractionMethod: '',
          durationMs: 0,
          startedAt: fixedNow,
        },
      ],
    });

    expect(metrics.dailySeries).toHaveLength(7);
    expect(metrics.overallSuccessRate).toBe(75); // 3 completed / (3 completed + 1 failed)
    expect(metrics.avgPagesPerCompleted).toBe(15); // 45 / 3
    expect(metrics.topUsers[0].clientId).toBe('u_top');
    expect(metrics.topUsers[1].clientId).toBe('u_heavy_pages');
    expect(metrics.outcomeSlices.map((s) => s.key)).toEqual(['completed', 'failed', 'blocked', 'pending']);
    expect(metrics.extractionMethods.length).toBeGreaterThanOrEqual(2);

    const byPages = buildDashboardMetrics({
      windowDays: 14,
      topUsersSort: 'pages',
      now: fixedNow,
      summary: {
        totalUsers: 2,
        onlineRecentlyCount: 1,
        blockedUsersCount: 0,
        totalConversions: 5,
        completedConversions: 3,
        failedConversions: 1,
        blockedAttempts: 1,
        totalPagesConverted: 45,
        todayConversions: 2,
        todayPages: 25,
      },
      users: [
        {
          clientId: 'u_top',
          displayName: 'أحمد',
          adminNote: '',
          firstSeenAt: fixedNow,
          lastSeenAt: fixedNow,
          lastIp: '1.1.1.1',
          knownIps: ['1.1.1.1'],
          userAgent: 'Chrome',
          deviceLabel: 'Chrome',
          accessMode: 'active',
          customBlockMessage: '',
          customDailyPageLimit: 0,
          blockMatchingIpToo: false,
          totalConversions: 3,
          completedConversions: 2,
          failedConversions: 1,
          blockedAttempts: 0,
          totalPagesConverted: 15,
          lastFileName: 'b.pdf',
          lastActivityAt: fixedNow,
          todayConversions: 0,
          todayPages: 0,
        },
        {
          clientId: 'u_heavy_pages',
          displayName: 'فاطمة',
          adminNote: '',
          firstSeenAt: fixedNow,
          lastSeenAt: fixedNow,
          lastIp: '2.2.2.2',
          knownIps: ['2.2.2.2'],
          userAgent: 'Safari',
          deviceLabel: 'Safari',
          accessMode: 'active',
          customBlockMessage: '',
          customDailyPageLimit: 0,
          blockMatchingIpToo: false,
          totalConversions: 2,
          completedConversions: 1,
          failedConversions: 0,
          blockedAttempts: 1,
          totalPagesConverted: 30,
          lastFileName: 'book.pdf',
          lastActivityAt: fixedNow,
          todayConversions: 0,
          todayPages: 0,
        },
      ],
      logs: [],
    });

    expect(byPages.dailySeries).toHaveLength(14);
    expect(byPages.topUsers[0].clientId).toBe('u_heavy_pages');
  });

  it('handles empty logs and zero users gracefully', () => {
    const empty = buildDashboardMetrics({
      windowDays: 30,
      topUsersSort: 'conversions',
      summary: {
        totalUsers: 0,
        onlineRecentlyCount: 0,
        blockedUsersCount: 0,
        totalConversions: 0,
        completedConversions: 0,
        failedConversions: 0,
        blockedAttempts: 0,
        totalPagesConverted: 0,
        todayConversions: 0,
        todayPages: 0,
      },
      users: [],
      logs: [],
    });

    expect(empty.dailySeries).toHaveLength(30);
    expect(empty.topUsers).toEqual([]);
    expect(empty.outcomeSlices).toEqual([]);
    expect(empty.overallSuccessRate).toBeNull();
  });
});

