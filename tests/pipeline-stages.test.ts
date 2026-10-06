import { describe, it, expect } from 'vitest';
import { createInitialStages, updateStageList } from '../src/utils/pipelineStages';
import type { ProcessingStageId, StageStatus } from '../src/types';

/**
 * GROUP D — src/utils/pipelineStages.ts
 *
 * The eight-element stage-order array is written out TWICE in this file, once inside
 * `createInitialStages` (pipelineStages.ts:4-13) and once inside `updateStageList`
 * (pipelineStages.ts:94-103). `updateStageList` derives its result from `createInitialStages`
 * and only uses its own copy for `indexOf`, so the two copies must stay identical or
 * `updateStageList` will mark the wrong stage in progress. That coupling is pinned below.
 */

/** Every stage id in the type, asserted against the union so a new stage cannot be forgotten. */
const ALL_STAGE_IDS: ProcessingStageId[] = [
  'image_denoise',
  'extraction',
  'contextual',
  'grammar',
  'structural',
  'quranic_verification',
  'layout_integrity',
  'finalizing',
];

/** The per-stage in-progress defaults, which only `createInitialStages` ever applies. */
const IN_PROGRESS_DEFAULTS: Record<ProcessingStageId, number> = {
  image_denoise: 50,
  extraction: 40,
  contextual: 55,
  grammar: 70,
  structural: 85,
  quranic_verification: 90,
  layout_integrity: 95,
  finalizing: 98,
};

describe('D. pipelineStages — createInitialStages', () => {
  it('the type union and the emitted stage list are the same eight ids, in order', () => {
    expect(createInitialStages().map(s => s.id)).toEqual(ALL_STAGE_IDS);
    expect(createInitialStages()).toHaveLength(8);
  });

  it('the default active stage is "extraction" (pipelineStages.ts:3)', () => {
    const byDefault = createInitialStages();
    const explicit = createInitialStages('extraction');
    expect(byDefault).toEqual(explicit);
    expect(byDefault.find(s => s.status === 'in_progress')!.id).toBe('extraction');
  });

  it('pins the full stage list for EVERY ProcessingStageId', () => {
    // One snapshot for the whole matrix: `toMatchInlineSnapshot` cannot be called twice at the
    // same source location, so a loop would silently write only the last one.
    expect(
      ALL_STAGE_IDS.map(id => ({ activeStage: id, stages: createInitialStages(id) })),
    ).toMatchInlineSnapshot(`
      [
        {
          "activeStage": "image_denoise",
          "stages": [
            {
              "id": "image_denoise",
              "progress": 50,
              "status": "in_progress",
              "subtitle": "تنقية التشويش، إزالة التحبيب ومعالجة بهتان الوثائق القديمة لتعزيز دقة التعرف",
              "title": "تحسين الصور المشوشة (De-noise)",
            },
            {
              "id": "extraction",
              "progress": 0,
              "status": "pending",
              "subtitle": "تفريغ النصوص والجداول والرموز بدقة عالية",
              "title": "استخراج وقراءة المحتوى والجداول",
            },
            {
              "id": "contextual",
              "progress": 0,
              "status": "pending",
              "subtitle": "مطابقة نصوص ورسم المصحف الشريف وضبط متون كتب الحديث الستة",
              "title": "الفحص السياقي للآيات والأحاديث (Contextual Checker)",
            },
            {
              "id": "grammar",
              "progress": 0,
              "status": "pending",
              "subtitle": "كشف الجمل المفتوحة والبتر المفاجئ وتوقع التكملات الأكاديمية",
              "title": "التحليل النحوي والتركيبي (Grammar Analyzer)",
            },
            {
              "id": "structural",
              "progress": 0,
              "status": "pending",
              "subtitle": "فحص وضبط تسلسل العناوين وفصل الهوامش وترتيب الترقيم الهرمي",
              "title": "التدقيق الهيكلي ومطابقة الترقيم والهوامش (Structural Auditor)",
            },
            {
              "id": "quranic_verification",
              "progress": 0,
              "status": "pending",
              "subtitle": "مطابقة الآيات القرآنية مع المصحف الشريف بالرسم العثماني المعتمد لضمان دقة 100%",
              "title": "التحقق القرآني بالرسم العثماني",
            },
            {
              "id": "layout_integrity",
              "progress": 0,
              "status": "pending",
              "subtitle": "فحص هيكلية كل صفحة وتثبيت أبعاد الجداول والقوائم لضمان اتجاه RTL متطابق 100%",
              "title": "معايرة وهيكلة الصفحات والجداول (Layout Integrity Engine)",
            },
            {
              "id": "finalizing",
              "progress": 0,
              "status": "pending",
              "subtitle": "تطهير الفراغات وتوليد مستند Word (.docx) محقق 100%",
              "title": "الإخراج والضبط النهائي بالمسطرة",
            },
          ],
        },
        {
          "activeStage": "extraction",
          "stages": [
            {
              "id": "image_denoise",
              "progress": 100,
              "status": "completed",
              "subtitle": "تنقية التشويش، إزالة التحبيب ومعالجة بهتان الوثائق القديمة لتعزيز دقة التعرف",
              "title": "تحسين الصور المشوشة (De-noise)",
            },
            {
              "id": "extraction",
              "progress": 40,
              "status": "in_progress",
              "subtitle": "تفريغ النصوص والجداول والرموز بدقة عالية",
              "title": "استخراج وقراءة المحتوى والجداول",
            },
            {
              "id": "contextual",
              "progress": 0,
              "status": "pending",
              "subtitle": "مطابقة نصوص ورسم المصحف الشريف وضبط متون كتب الحديث الستة",
              "title": "الفحص السياقي للآيات والأحاديث (Contextual Checker)",
            },
            {
              "id": "grammar",
              "progress": 0,
              "status": "pending",
              "subtitle": "كشف الجمل المفتوحة والبتر المفاجئ وتوقع التكملات الأكاديمية",
              "title": "التحليل النحوي والتركيبي (Grammar Analyzer)",
            },
            {
              "id": "structural",
              "progress": 0,
              "status": "pending",
              "subtitle": "فحص وضبط تسلسل العناوين وفصل الهوامش وترتيب الترقيم الهرمي",
              "title": "التدقيق الهيكلي ومطابقة الترقيم والهوامش (Structural Auditor)",
            },
            {
              "id": "quranic_verification",
              "progress": 0,
              "status": "pending",
              "subtitle": "مطابقة الآيات القرآنية مع المصحف الشريف بالرسم العثماني المعتمد لضمان دقة 100%",
              "title": "التحقق القرآني بالرسم العثماني",
            },
            {
              "id": "layout_integrity",
              "progress": 0,
              "status": "pending",
              "subtitle": "فحص هيكلية كل صفحة وتثبيت أبعاد الجداول والقوائم لضمان اتجاه RTL متطابق 100%",
              "title": "معايرة وهيكلة الصفحات والجداول (Layout Integrity Engine)",
            },
            {
              "id": "finalizing",
              "progress": 0,
              "status": "pending",
              "subtitle": "تطهير الفراغات وتوليد مستند Word (.docx) محقق 100%",
              "title": "الإخراج والضبط النهائي بالمسطرة",
            },
          ],
        },
        {
          "activeStage": "contextual",
          "stages": [
            {
              "id": "image_denoise",
              "progress": 100,
              "status": "completed",
              "subtitle": "تنقية التشويش، إزالة التحبيب ومعالجة بهتان الوثائق القديمة لتعزيز دقة التعرف",
              "title": "تحسين الصور المشوشة (De-noise)",
            },
            {
              "id": "extraction",
              "progress": 100,
              "status": "completed",
              "subtitle": "تفريغ النصوص والجداول والرموز بدقة عالية",
              "title": "استخراج وقراءة المحتوى والجداول",
            },
            {
              "id": "contextual",
              "progress": 55,
              "status": "in_progress",
              "subtitle": "مطابقة نصوص ورسم المصحف الشريف وضبط متون كتب الحديث الستة",
              "title": "الفحص السياقي للآيات والأحاديث (Contextual Checker)",
            },
            {
              "id": "grammar",
              "progress": 0,
              "status": "pending",
              "subtitle": "كشف الجمل المفتوحة والبتر المفاجئ وتوقع التكملات الأكاديمية",
              "title": "التحليل النحوي والتركيبي (Grammar Analyzer)",
            },
            {
              "id": "structural",
              "progress": 0,
              "status": "pending",
              "subtitle": "فحص وضبط تسلسل العناوين وفصل الهوامش وترتيب الترقيم الهرمي",
              "title": "التدقيق الهيكلي ومطابقة الترقيم والهوامش (Structural Auditor)",
            },
            {
              "id": "quranic_verification",
              "progress": 0,
              "status": "pending",
              "subtitle": "مطابقة الآيات القرآنية مع المصحف الشريف بالرسم العثماني المعتمد لضمان دقة 100%",
              "title": "التحقق القرآني بالرسم العثماني",
            },
            {
              "id": "layout_integrity",
              "progress": 0,
              "status": "pending",
              "subtitle": "فحص هيكلية كل صفحة وتثبيت أبعاد الجداول والقوائم لضمان اتجاه RTL متطابق 100%",
              "title": "معايرة وهيكلة الصفحات والجداول (Layout Integrity Engine)",
            },
            {
              "id": "finalizing",
              "progress": 0,
              "status": "pending",
              "subtitle": "تطهير الفراغات وتوليد مستند Word (.docx) محقق 100%",
              "title": "الإخراج والضبط النهائي بالمسطرة",
            },
          ],
        },
        {
          "activeStage": "grammar",
          "stages": [
            {
              "id": "image_denoise",
              "progress": 100,
              "status": "completed",
              "subtitle": "تنقية التشويش، إزالة التحبيب ومعالجة بهتان الوثائق القديمة لتعزيز دقة التعرف",
              "title": "تحسين الصور المشوشة (De-noise)",
            },
            {
              "id": "extraction",
              "progress": 100,
              "status": "completed",
              "subtitle": "تفريغ النصوص والجداول والرموز بدقة عالية",
              "title": "استخراج وقراءة المحتوى والجداول",
            },
            {
              "id": "contextual",
              "progress": 100,
              "status": "completed",
              "subtitle": "مطابقة نصوص ورسم المصحف الشريف وضبط متون كتب الحديث الستة",
              "title": "الفحص السياقي للآيات والأحاديث (Contextual Checker)",
            },
            {
              "id": "grammar",
              "progress": 70,
              "status": "in_progress",
              "subtitle": "كشف الجمل المفتوحة والبتر المفاجئ وتوقع التكملات الأكاديمية",
              "title": "التحليل النحوي والتركيبي (Grammar Analyzer)",
            },
            {
              "id": "structural",
              "progress": 0,
              "status": "pending",
              "subtitle": "فحص وضبط تسلسل العناوين وفصل الهوامش وترتيب الترقيم الهرمي",
              "title": "التدقيق الهيكلي ومطابقة الترقيم والهوامش (Structural Auditor)",
            },
            {
              "id": "quranic_verification",
              "progress": 0,
              "status": "pending",
              "subtitle": "مطابقة الآيات القرآنية مع المصحف الشريف بالرسم العثماني المعتمد لضمان دقة 100%",
              "title": "التحقق القرآني بالرسم العثماني",
            },
            {
              "id": "layout_integrity",
              "progress": 0,
              "status": "pending",
              "subtitle": "فحص هيكلية كل صفحة وتثبيت أبعاد الجداول والقوائم لضمان اتجاه RTL متطابق 100%",
              "title": "معايرة وهيكلة الصفحات والجداول (Layout Integrity Engine)",
            },
            {
              "id": "finalizing",
              "progress": 0,
              "status": "pending",
              "subtitle": "تطهير الفراغات وتوليد مستند Word (.docx) محقق 100%",
              "title": "الإخراج والضبط النهائي بالمسطرة",
            },
          ],
        },
        {
          "activeStage": "structural",
          "stages": [
            {
              "id": "image_denoise",
              "progress": 100,
              "status": "completed",
              "subtitle": "تنقية التشويش، إزالة التحبيب ومعالجة بهتان الوثائق القديمة لتعزيز دقة التعرف",
              "title": "تحسين الصور المشوشة (De-noise)",
            },
            {
              "id": "extraction",
              "progress": 100,
              "status": "completed",
              "subtitle": "تفريغ النصوص والجداول والرموز بدقة عالية",
              "title": "استخراج وقراءة المحتوى والجداول",
            },
            {
              "id": "contextual",
              "progress": 100,
              "status": "completed",
              "subtitle": "مطابقة نصوص ورسم المصحف الشريف وضبط متون كتب الحديث الستة",
              "title": "الفحص السياقي للآيات والأحاديث (Contextual Checker)",
            },
            {
              "id": "grammar",
              "progress": 100,
              "status": "completed",
              "subtitle": "كشف الجمل المفتوحة والبتر المفاجئ وتوقع التكملات الأكاديمية",
              "title": "التحليل النحوي والتركيبي (Grammar Analyzer)",
            },
            {
              "id": "structural",
              "progress": 85,
              "status": "in_progress",
              "subtitle": "فحص وضبط تسلسل العناوين وفصل الهوامش وترتيب الترقيم الهرمي",
              "title": "التدقيق الهيكلي ومطابقة الترقيم والهوامش (Structural Auditor)",
            },
            {
              "id": "quranic_verification",
              "progress": 0,
              "status": "pending",
              "subtitle": "مطابقة الآيات القرآنية مع المصحف الشريف بالرسم العثماني المعتمد لضمان دقة 100%",
              "title": "التحقق القرآني بالرسم العثماني",
            },
            {
              "id": "layout_integrity",
              "progress": 0,
              "status": "pending",
              "subtitle": "فحص هيكلية كل صفحة وتثبيت أبعاد الجداول والقوائم لضمان اتجاه RTL متطابق 100%",
              "title": "معايرة وهيكلة الصفحات والجداول (Layout Integrity Engine)",
            },
            {
              "id": "finalizing",
              "progress": 0,
              "status": "pending",
              "subtitle": "تطهير الفراغات وتوليد مستند Word (.docx) محقق 100%",
              "title": "الإخراج والضبط النهائي بالمسطرة",
            },
          ],
        },
        {
          "activeStage": "quranic_verification",
          "stages": [
            {
              "id": "image_denoise",
              "progress": 100,
              "status": "completed",
              "subtitle": "تنقية التشويش، إزالة التحبيب ومعالجة بهتان الوثائق القديمة لتعزيز دقة التعرف",
              "title": "تحسين الصور المشوشة (De-noise)",
            },
            {
              "id": "extraction",
              "progress": 100,
              "status": "completed",
              "subtitle": "تفريغ النصوص والجداول والرموز بدقة عالية",
              "title": "استخراج وقراءة المحتوى والجداول",
            },
            {
              "id": "contextual",
              "progress": 100,
              "status": "completed",
              "subtitle": "مطابقة نصوص ورسم المصحف الشريف وضبط متون كتب الحديث الستة",
              "title": "الفحص السياقي للآيات والأحاديث (Contextual Checker)",
            },
            {
              "id": "grammar",
              "progress": 100,
              "status": "completed",
              "subtitle": "كشف الجمل المفتوحة والبتر المفاجئ وتوقع التكملات الأكاديمية",
              "title": "التحليل النحوي والتركيبي (Grammar Analyzer)",
            },
            {
              "id": "structural",
              "progress": 100,
              "status": "completed",
              "subtitle": "فحص وضبط تسلسل العناوين وفصل الهوامش وترتيب الترقيم الهرمي",
              "title": "التدقيق الهيكلي ومطابقة الترقيم والهوامش (Structural Auditor)",
            },
            {
              "id": "quranic_verification",
              "progress": 90,
              "status": "in_progress",
              "subtitle": "مطابقة الآيات القرآنية مع المصحف الشريف بالرسم العثماني المعتمد لضمان دقة 100%",
              "title": "التحقق القرآني بالرسم العثماني",
            },
            {
              "id": "layout_integrity",
              "progress": 0,
              "status": "pending",
              "subtitle": "فحص هيكلية كل صفحة وتثبيت أبعاد الجداول والقوائم لضمان اتجاه RTL متطابق 100%",
              "title": "معايرة وهيكلة الصفحات والجداول (Layout Integrity Engine)",
            },
            {
              "id": "finalizing",
              "progress": 0,
              "status": "pending",
              "subtitle": "تطهير الفراغات وتوليد مستند Word (.docx) محقق 100%",
              "title": "الإخراج والضبط النهائي بالمسطرة",
            },
          ],
        },
        {
          "activeStage": "layout_integrity",
          "stages": [
            {
              "id": "image_denoise",
              "progress": 100,
              "status": "completed",
              "subtitle": "تنقية التشويش، إزالة التحبيب ومعالجة بهتان الوثائق القديمة لتعزيز دقة التعرف",
              "title": "تحسين الصور المشوشة (De-noise)",
            },
            {
              "id": "extraction",
              "progress": 100,
              "status": "completed",
              "subtitle": "تفريغ النصوص والجداول والرموز بدقة عالية",
              "title": "استخراج وقراءة المحتوى والجداول",
            },
            {
              "id": "contextual",
              "progress": 100,
              "status": "completed",
              "subtitle": "مطابقة نصوص ورسم المصحف الشريف وضبط متون كتب الحديث الستة",
              "title": "الفحص السياقي للآيات والأحاديث (Contextual Checker)",
            },
            {
              "id": "grammar",
              "progress": 100,
              "status": "completed",
              "subtitle": "كشف الجمل المفتوحة والبتر المفاجئ وتوقع التكملات الأكاديمية",
              "title": "التحليل النحوي والتركيبي (Grammar Analyzer)",
            },
            {
              "id": "structural",
              "progress": 100,
              "status": "completed",
              "subtitle": "فحص وضبط تسلسل العناوين وفصل الهوامش وترتيب الترقيم الهرمي",
              "title": "التدقيق الهيكلي ومطابقة الترقيم والهوامش (Structural Auditor)",
            },
            {
              "id": "quranic_verification",
              "progress": 100,
              "status": "completed",
              "subtitle": "مطابقة الآيات القرآنية مع المصحف الشريف بالرسم العثماني المعتمد لضمان دقة 100%",
              "title": "التحقق القرآني بالرسم العثماني",
            },
            {
              "id": "layout_integrity",
              "progress": 95,
              "status": "in_progress",
              "subtitle": "فحص هيكلية كل صفحة وتثبيت أبعاد الجداول والقوائم لضمان اتجاه RTL متطابق 100%",
              "title": "معايرة وهيكلة الصفحات والجداول (Layout Integrity Engine)",
            },
            {
              "id": "finalizing",
              "progress": 0,
              "status": "pending",
              "subtitle": "تطهير الفراغات وتوليد مستند Word (.docx) محقق 100%",
              "title": "الإخراج والضبط النهائي بالمسطرة",
            },
          ],
        },
        {
          "activeStage": "finalizing",
          "stages": [
            {
              "id": "image_denoise",
              "progress": 100,
              "status": "completed",
              "subtitle": "تنقية التشويش، إزالة التحبيب ومعالجة بهتان الوثائق القديمة لتعزيز دقة التعرف",
              "title": "تحسين الصور المشوشة (De-noise)",
            },
            {
              "id": "extraction",
              "progress": 100,
              "status": "completed",
              "subtitle": "تفريغ النصوص والجداول والرموز بدقة عالية",
              "title": "استخراج وقراءة المحتوى والجداول",
            },
            {
              "id": "contextual",
              "progress": 100,
              "status": "completed",
              "subtitle": "مطابقة نصوص ورسم المصحف الشريف وضبط متون كتب الحديث الستة",
              "title": "الفحص السياقي للآيات والأحاديث (Contextual Checker)",
            },
            {
              "id": "grammar",
              "progress": 100,
              "status": "completed",
              "subtitle": "كشف الجمل المفتوحة والبتر المفاجئ وتوقع التكملات الأكاديمية",
              "title": "التحليل النحوي والتركيبي (Grammar Analyzer)",
            },
            {
              "id": "structural",
              "progress": 100,
              "status": "completed",
              "subtitle": "فحص وضبط تسلسل العناوين وفصل الهوامش وترتيب الترقيم الهرمي",
              "title": "التدقيق الهيكلي ومطابقة الترقيم والهوامش (Structural Auditor)",
            },
            {
              "id": "quranic_verification",
              "progress": 100,
              "status": "completed",
              "subtitle": "مطابقة الآيات القرآنية مع المصحف الشريف بالرسم العثماني المعتمد لضمان دقة 100%",
              "title": "التحقق القرآني بالرسم العثماني",
            },
            {
              "id": "layout_integrity",
              "progress": 100,
              "status": "completed",
              "subtitle": "فحص هيكلية كل صفحة وتثبيت أبعاد الجداول والقوائم لضمان اتجاه RTL متطابق 100%",
              "title": "معايرة وهيكلة الصفحات والجداول (Layout Integrity Engine)",
            },
            {
              "id": "finalizing",
              "progress": 98,
              "status": "in_progress",
              "subtitle": "تطهير الفراغات وتوليد مستند Word (.docx) محقق 100%",
              "title": "الإخراج والضبط النهائي بالمسطرة",
            },
          ],
        },
      ]
    `);
  });

  it('pins the title/subtitle catalogue once, independent of which stage is active', () => {
    // Titles and subtitles are constants; only status/progress move. Splitting them out keeps
    // the snapshot readable and makes a copy-paste typo in a title obvious.
    expect(
      createInitialStages().map(s => ({ id: s.id, title: s.title, subtitle: s.subtitle })),
    ).toMatchInlineSnapshot(`
      [
        {
          "id": "image_denoise",
          "subtitle": "تنقية التشويش، إزالة التحبيب ومعالجة بهتان الوثائق القديمة لتعزيز دقة التعرف",
          "title": "تحسين الصور المشوشة (De-noise)",
        },
        {
          "id": "extraction",
          "subtitle": "تفريغ النصوص والجداول والرموز بدقة عالية",
          "title": "استخراج وقراءة المحتوى والجداول",
        },
        {
          "id": "contextual",
          "subtitle": "مطابقة نصوص ورسم المصحف الشريف وضبط متون كتب الحديث الستة",
          "title": "الفحص السياقي للآيات والأحاديث (Contextual Checker)",
        },
        {
          "id": "grammar",
          "subtitle": "كشف الجمل المفتوحة والبتر المفاجئ وتوقع التكملات الأكاديمية",
          "title": "التحليل النحوي والتركيبي (Grammar Analyzer)",
        },
        {
          "id": "structural",
          "subtitle": "فحص وضبط تسلسل العناوين وفصل الهوامش وترتيب الترقيم الهرمي",
          "title": "التدقيق الهيكلي ومطابقة الترقيم والهوامش (Structural Auditor)",
        },
        {
          "id": "quranic_verification",
          "subtitle": "مطابقة الآيات القرآنية مع المصحف الشريف بالرسم العثماني المعتمد لضمان دقة 100%",
          "title": "التحقق القرآني بالرسم العثماني",
        },
        {
          "id": "layout_integrity",
          "subtitle": "فحص هيكلية كل صفحة وتثبيت أبعاد الجداول والقوائم لضمان اتجاه RTL متطابق 100%",
          "title": "معايرة وهيكلة الصفحات والجداول (Layout Integrity Engine)",
        },
        {
          "id": "finalizing",
          "subtitle": "تطهير الفراغات وتوليد مستند Word (.docx) محقق 100%",
          "title": "الإخراج والضبط النهائي بالمسطرة",
        },
      ]
    `);
  });

  it('status partition: every stage before the active one is completed, after is pending', () => {
    expect(
      ALL_STAGE_IDS.map(active => ({
        active,
        completed: createInitialStages(active).filter(s => s.status === 'completed').map(s => s.id),
        inProgress: createInitialStages(active).filter(s => s.status === 'in_progress').map(s => s.id),
        pending: createInitialStages(active).filter(s => s.status === 'pending').map(s => s.id),
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "active": "image_denoise",
          "completed": [],
          "inProgress": [
            "image_denoise",
          ],
          "pending": [
            "extraction",
            "contextual",
            "grammar",
            "structural",
            "quranic_verification",
            "layout_integrity",
            "finalizing",
          ],
        },
        {
          "active": "extraction",
          "completed": [
            "image_denoise",
          ],
          "inProgress": [
            "extraction",
          ],
          "pending": [
            "contextual",
            "grammar",
            "structural",
            "quranic_verification",
            "layout_integrity",
            "finalizing",
          ],
        },
        {
          "active": "contextual",
          "completed": [
            "image_denoise",
            "extraction",
          ],
          "inProgress": [
            "contextual",
          ],
          "pending": [
            "grammar",
            "structural",
            "quranic_verification",
            "layout_integrity",
            "finalizing",
          ],
        },
        {
          "active": "grammar",
          "completed": [
            "image_denoise",
            "extraction",
            "contextual",
          ],
          "inProgress": [
            "grammar",
          ],
          "pending": [
            "structural",
            "quranic_verification",
            "layout_integrity",
            "finalizing",
          ],
        },
        {
          "active": "structural",
          "completed": [
            "image_denoise",
            "extraction",
            "contextual",
            "grammar",
          ],
          "inProgress": [
            "structural",
          ],
          "pending": [
            "quranic_verification",
            "layout_integrity",
            "finalizing",
          ],
        },
        {
          "active": "quranic_verification",
          "completed": [
            "image_denoise",
            "extraction",
            "contextual",
            "grammar",
            "structural",
          ],
          "inProgress": [
            "quranic_verification",
          ],
          "pending": [
            "layout_integrity",
            "finalizing",
          ],
        },
        {
          "active": "layout_integrity",
          "completed": [
            "image_denoise",
            "extraction",
            "contextual",
            "grammar",
            "structural",
            "quranic_verification",
          ],
          "inProgress": [
            "layout_integrity",
          ],
          "pending": [
            "finalizing",
          ],
        },
        {
          "active": "finalizing",
          "completed": [
            "image_denoise",
            "extraction",
            "contextual",
            "grammar",
            "structural",
            "quranic_verification",
            "layout_integrity",
          ],
          "inProgress": [
            "finalizing",
          ],
          "pending": [],
        },
      ]
    `);
  });

  it('the active stage gets its per-stage default progress; others get 100 or 0', () => {
    expect(
      ALL_STAGE_IDS.map(active => ({
        active,
        progress: createInitialStages(active).map(s => `${s.id}=${s.progress}`),
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "active": "image_denoise",
          "progress": [
            "image_denoise=50",
            "extraction=0",
            "contextual=0",
            "grammar=0",
            "structural=0",
            "quranic_verification=0",
            "layout_integrity=0",
            "finalizing=0",
          ],
        },
        {
          "active": "extraction",
          "progress": [
            "image_denoise=100",
            "extraction=40",
            "contextual=0",
            "grammar=0",
            "structural=0",
            "quranic_verification=0",
            "layout_integrity=0",
            "finalizing=0",
          ],
        },
        {
          "active": "contextual",
          "progress": [
            "image_denoise=100",
            "extraction=100",
            "contextual=55",
            "grammar=0",
            "structural=0",
            "quranic_verification=0",
            "layout_integrity=0",
            "finalizing=0",
          ],
        },
        {
          "active": "grammar",
          "progress": [
            "image_denoise=100",
            "extraction=100",
            "contextual=100",
            "grammar=70",
            "structural=0",
            "quranic_verification=0",
            "layout_integrity=0",
            "finalizing=0",
          ],
        },
        {
          "active": "structural",
          "progress": [
            "image_denoise=100",
            "extraction=100",
            "contextual=100",
            "grammar=100",
            "structural=85",
            "quranic_verification=0",
            "layout_integrity=0",
            "finalizing=0",
          ],
        },
        {
          "active": "quranic_verification",
          "progress": [
            "image_denoise=100",
            "extraction=100",
            "contextual=100",
            "grammar=100",
            "structural=100",
            "quranic_verification=90",
            "layout_integrity=0",
            "finalizing=0",
          ],
        },
        {
          "active": "layout_integrity",
          "progress": [
            "image_denoise=100",
            "extraction=100",
            "contextual=100",
            "grammar=100",
            "structural=100",
            "quranic_verification=100",
            "layout_integrity=95",
            "finalizing=0",
          ],
        },
        {
          "active": "finalizing",
          "progress": [
            "image_denoise=100",
            "extraction=100",
            "contextual=100",
            "grammar=100",
            "structural=100",
            "quranic_verification=100",
            "layout_integrity=100",
            "finalizing=98",
          ],
        },
      ]
    `);
  });

  it('an unknown stage id yields all-pending with no in_progress stage', () => {
    // indexOf returns -1, so every real stage has idx > activeIndex and is "pending", and
    // getStatus is never called with the unknown id. PINNED, NOT FIXED: a typo in a caller's
    // ProcessingStageId produces a UI with nothing running and nothing completed.
    const bogus = createInitialStages('not_a_stage' as ProcessingStageId);
    expect(bogus.map(s => s.status)).toEqual(Array(8).fill('pending'));
    expect(bogus.map(s => s.progress)).toEqual(Array(8).fill(0));
  });
});

describe('D. pipelineStages — updateStageList', () => {
  it('pins the full stage list for EVERY ProcessingStageId at the default progress', () => {
    expect(
      ALL_STAGE_IDS.map(id => ({ activeStage: id, stages: updateStageList(id) })),
    ).toMatchInlineSnapshot(`
      [
        {
          "activeStage": "image_denoise",
          "stages": [
            {
              "id": "image_denoise",
              "progress": 60,
              "status": "in_progress",
              "subtitle": "تنقية التشويش، إزالة التحبيب ومعالجة بهتان الوثائق القديمة لتعزيز دقة التعرف",
              "title": "تحسين الصور المشوشة (De-noise)",
            },
            {
              "id": "extraction",
              "progress": 0,
              "status": "pending",
              "subtitle": "تفريغ النصوص والجداول والرموز بدقة عالية",
              "title": "استخراج وقراءة المحتوى والجداول",
            },
            {
              "id": "contextual",
              "progress": 0,
              "status": "pending",
              "subtitle": "مطابقة نصوص ورسم المصحف الشريف وضبط متون كتب الحديث الستة",
              "title": "الفحص السياقي للآيات والأحاديث (Contextual Checker)",
            },
            {
              "id": "grammar",
              "progress": 0,
              "status": "pending",
              "subtitle": "كشف الجمل المفتوحة والبتر المفاجئ وتوقع التكملات الأكاديمية",
              "title": "التحليل النحوي والتركيبي (Grammar Analyzer)",
            },
            {
              "id": "structural",
              "progress": 0,
              "status": "pending",
              "subtitle": "فحص وضبط تسلسل العناوين وفصل الهوامش وترتيب الترقيم الهرمي",
              "title": "التدقيق الهيكلي ومطابقة الترقيم والهوامش (Structural Auditor)",
            },
            {
              "id": "quranic_verification",
              "progress": 0,
              "status": "pending",
              "subtitle": "مطابقة الآيات القرآنية مع المصحف الشريف بالرسم العثماني المعتمد لضمان دقة 100%",
              "title": "التحقق القرآني بالرسم العثماني",
            },
            {
              "id": "layout_integrity",
              "progress": 0,
              "status": "pending",
              "subtitle": "فحص هيكلية كل صفحة وتثبيت أبعاد الجداول والقوائم لضمان اتجاه RTL متطابق 100%",
              "title": "معايرة وهيكلة الصفحات والجداول (Layout Integrity Engine)",
            },
            {
              "id": "finalizing",
              "progress": 0,
              "status": "pending",
              "subtitle": "تطهير الفراغات وتوليد مستند Word (.docx) محقق 100%",
              "title": "الإخراج والضبط النهائي بالمسطرة",
            },
          ],
        },
        {
          "activeStage": "extraction",
          "stages": [
            {
              "id": "image_denoise",
              "progress": 100,
              "status": "completed",
              "subtitle": "تنقية التشويش، إزالة التحبيب ومعالجة بهتان الوثائق القديمة لتعزيز دقة التعرف",
              "title": "تحسين الصور المشوشة (De-noise)",
            },
            {
              "id": "extraction",
              "progress": 60,
              "status": "in_progress",
              "subtitle": "تفريغ النصوص والجداول والرموز بدقة عالية",
              "title": "استخراج وقراءة المحتوى والجداول",
            },
            {
              "id": "contextual",
              "progress": 0,
              "status": "pending",
              "subtitle": "مطابقة نصوص ورسم المصحف الشريف وضبط متون كتب الحديث الستة",
              "title": "الفحص السياقي للآيات والأحاديث (Contextual Checker)",
            },
            {
              "id": "grammar",
              "progress": 0,
              "status": "pending",
              "subtitle": "كشف الجمل المفتوحة والبتر المفاجئ وتوقع التكملات الأكاديمية",
              "title": "التحليل النحوي والتركيبي (Grammar Analyzer)",
            },
            {
              "id": "structural",
              "progress": 0,
              "status": "pending",
              "subtitle": "فحص وضبط تسلسل العناوين وفصل الهوامش وترتيب الترقيم الهرمي",
              "title": "التدقيق الهيكلي ومطابقة الترقيم والهوامش (Structural Auditor)",
            },
            {
              "id": "quranic_verification",
              "progress": 0,
              "status": "pending",
              "subtitle": "مطابقة الآيات القرآنية مع المصحف الشريف بالرسم العثماني المعتمد لضمان دقة 100%",
              "title": "التحقق القرآني بالرسم العثماني",
            },
            {
              "id": "layout_integrity",
              "progress": 0,
              "status": "pending",
              "subtitle": "فحص هيكلية كل صفحة وتثبيت أبعاد الجداول والقوائم لضمان اتجاه RTL متطابق 100%",
              "title": "معايرة وهيكلة الصفحات والجداول (Layout Integrity Engine)",
            },
            {
              "id": "finalizing",
              "progress": 0,
              "status": "pending",
              "subtitle": "تطهير الفراغات وتوليد مستند Word (.docx) محقق 100%",
              "title": "الإخراج والضبط النهائي بالمسطرة",
            },
          ],
        },
        {
          "activeStage": "contextual",
          "stages": [
            {
              "id": "image_denoise",
              "progress": 100,
              "status": "completed",
              "subtitle": "تنقية التشويش، إزالة التحبيب ومعالجة بهتان الوثائق القديمة لتعزيز دقة التعرف",
              "title": "تحسين الصور المشوشة (De-noise)",
            },
            {
              "id": "extraction",
              "progress": 100,
              "status": "completed",
              "subtitle": "تفريغ النصوص والجداول والرموز بدقة عالية",
              "title": "استخراج وقراءة المحتوى والجداول",
            },
            {
              "id": "contextual",
              "progress": 60,
              "status": "in_progress",
              "subtitle": "مطابقة نصوص ورسم المصحف الشريف وضبط متون كتب الحديث الستة",
              "title": "الفحص السياقي للآيات والأحاديث (Contextual Checker)",
            },
            {
              "id": "grammar",
              "progress": 0,
              "status": "pending",
              "subtitle": "كشف الجمل المفتوحة والبتر المفاجئ وتوقع التكملات الأكاديمية",
              "title": "التحليل النحوي والتركيبي (Grammar Analyzer)",
            },
            {
              "id": "structural",
              "progress": 0,
              "status": "pending",
              "subtitle": "فحص وضبط تسلسل العناوين وفصل الهوامش وترتيب الترقيم الهرمي",
              "title": "التدقيق الهيكلي ومطابقة الترقيم والهوامش (Structural Auditor)",
            },
            {
              "id": "quranic_verification",
              "progress": 0,
              "status": "pending",
              "subtitle": "مطابقة الآيات القرآنية مع المصحف الشريف بالرسم العثماني المعتمد لضمان دقة 100%",
              "title": "التحقق القرآني بالرسم العثماني",
            },
            {
              "id": "layout_integrity",
              "progress": 0,
              "status": "pending",
              "subtitle": "فحص هيكلية كل صفحة وتثبيت أبعاد الجداول والقوائم لضمان اتجاه RTL متطابق 100%",
              "title": "معايرة وهيكلة الصفحات والجداول (Layout Integrity Engine)",
            },
            {
              "id": "finalizing",
              "progress": 0,
              "status": "pending",
              "subtitle": "تطهير الفراغات وتوليد مستند Word (.docx) محقق 100%",
              "title": "الإخراج والضبط النهائي بالمسطرة",
            },
          ],
        },
        {
          "activeStage": "grammar",
          "stages": [
            {
              "id": "image_denoise",
              "progress": 100,
              "status": "completed",
              "subtitle": "تنقية التشويش، إزالة التحبيب ومعالجة بهتان الوثائق القديمة لتعزيز دقة التعرف",
              "title": "تحسين الصور المشوشة (De-noise)",
            },
            {
              "id": "extraction",
              "progress": 100,
              "status": "completed",
              "subtitle": "تفريغ النصوص والجداول والرموز بدقة عالية",
              "title": "استخراج وقراءة المحتوى والجداول",
            },
            {
              "id": "contextual",
              "progress": 100,
              "status": "completed",
              "subtitle": "مطابقة نصوص ورسم المصحف الشريف وضبط متون كتب الحديث الستة",
              "title": "الفحص السياقي للآيات والأحاديث (Contextual Checker)",
            },
            {
              "id": "grammar",
              "progress": 60,
              "status": "in_progress",
              "subtitle": "كشف الجمل المفتوحة والبتر المفاجئ وتوقع التكملات الأكاديمية",
              "title": "التحليل النحوي والتركيبي (Grammar Analyzer)",
            },
            {
              "id": "structural",
              "progress": 0,
              "status": "pending",
              "subtitle": "فحص وضبط تسلسل العناوين وفصل الهوامش وترتيب الترقيم الهرمي",
              "title": "التدقيق الهيكلي ومطابقة الترقيم والهوامش (Structural Auditor)",
            },
            {
              "id": "quranic_verification",
              "progress": 0,
              "status": "pending",
              "subtitle": "مطابقة الآيات القرآنية مع المصحف الشريف بالرسم العثماني المعتمد لضمان دقة 100%",
              "title": "التحقق القرآني بالرسم العثماني",
            },
            {
              "id": "layout_integrity",
              "progress": 0,
              "status": "pending",
              "subtitle": "فحص هيكلية كل صفحة وتثبيت أبعاد الجداول والقوائم لضمان اتجاه RTL متطابق 100%",
              "title": "معايرة وهيكلة الصفحات والجداول (Layout Integrity Engine)",
            },
            {
              "id": "finalizing",
              "progress": 0,
              "status": "pending",
              "subtitle": "تطهير الفراغات وتوليد مستند Word (.docx) محقق 100%",
              "title": "الإخراج والضبط النهائي بالمسطرة",
            },
          ],
        },
        {
          "activeStage": "structural",
          "stages": [
            {
              "id": "image_denoise",
              "progress": 100,
              "status": "completed",
              "subtitle": "تنقية التشويش، إزالة التحبيب ومعالجة بهتان الوثائق القديمة لتعزيز دقة التعرف",
              "title": "تحسين الصور المشوشة (De-noise)",
            },
            {
              "id": "extraction",
              "progress": 100,
              "status": "completed",
              "subtitle": "تفريغ النصوص والجداول والرموز بدقة عالية",
              "title": "استخراج وقراءة المحتوى والجداول",
            },
            {
              "id": "contextual",
              "progress": 100,
              "status": "completed",
              "subtitle": "مطابقة نصوص ورسم المصحف الشريف وضبط متون كتب الحديث الستة",
              "title": "الفحص السياقي للآيات والأحاديث (Contextual Checker)",
            },
            {
              "id": "grammar",
              "progress": 100,
              "status": "completed",
              "subtitle": "كشف الجمل المفتوحة والبتر المفاجئ وتوقع التكملات الأكاديمية",
              "title": "التحليل النحوي والتركيبي (Grammar Analyzer)",
            },
            {
              "id": "structural",
              "progress": 60,
              "status": "in_progress",
              "subtitle": "فحص وضبط تسلسل العناوين وفصل الهوامش وترتيب الترقيم الهرمي",
              "title": "التدقيق الهيكلي ومطابقة الترقيم والهوامش (Structural Auditor)",
            },
            {
              "id": "quranic_verification",
              "progress": 0,
              "status": "pending",
              "subtitle": "مطابقة الآيات القرآنية مع المصحف الشريف بالرسم العثماني المعتمد لضمان دقة 100%",
              "title": "التحقق القرآني بالرسم العثماني",
            },
            {
              "id": "layout_integrity",
              "progress": 0,
              "status": "pending",
              "subtitle": "فحص هيكلية كل صفحة وتثبيت أبعاد الجداول والقوائم لضمان اتجاه RTL متطابق 100%",
              "title": "معايرة وهيكلة الصفحات والجداول (Layout Integrity Engine)",
            },
            {
              "id": "finalizing",
              "progress": 0,
              "status": "pending",
              "subtitle": "تطهير الفراغات وتوليد مستند Word (.docx) محقق 100%",
              "title": "الإخراج والضبط النهائي بالمسطرة",
            },
          ],
        },
        {
          "activeStage": "quranic_verification",
          "stages": [
            {
              "id": "image_denoise",
              "progress": 100,
              "status": "completed",
              "subtitle": "تنقية التشويش، إزالة التحبيب ومعالجة بهتان الوثائق القديمة لتعزيز دقة التعرف",
              "title": "تحسين الصور المشوشة (De-noise)",
            },
            {
              "id": "extraction",
              "progress": 100,
              "status": "completed",
              "subtitle": "تفريغ النصوص والجداول والرموز بدقة عالية",
              "title": "استخراج وقراءة المحتوى والجداول",
            },
            {
              "id": "contextual",
              "progress": 100,
              "status": "completed",
              "subtitle": "مطابقة نصوص ورسم المصحف الشريف وضبط متون كتب الحديث الستة",
              "title": "الفحص السياقي للآيات والأحاديث (Contextual Checker)",
            },
            {
              "id": "grammar",
              "progress": 100,
              "status": "completed",
              "subtitle": "كشف الجمل المفتوحة والبتر المفاجئ وتوقع التكملات الأكاديمية",
              "title": "التحليل النحوي والتركيبي (Grammar Analyzer)",
            },
            {
              "id": "structural",
              "progress": 100,
              "status": "completed",
              "subtitle": "فحص وضبط تسلسل العناوين وفصل الهوامش وترتيب الترقيم الهرمي",
              "title": "التدقيق الهيكلي ومطابقة الترقيم والهوامش (Structural Auditor)",
            },
            {
              "id": "quranic_verification",
              "progress": 60,
              "status": "in_progress",
              "subtitle": "مطابقة الآيات القرآنية مع المصحف الشريف بالرسم العثماني المعتمد لضمان دقة 100%",
              "title": "التحقق القرآني بالرسم العثماني",
            },
            {
              "id": "layout_integrity",
              "progress": 0,
              "status": "pending",
              "subtitle": "فحص هيكلية كل صفحة وتثبيت أبعاد الجداول والقوائم لضمان اتجاه RTL متطابق 100%",
              "title": "معايرة وهيكلة الصفحات والجداول (Layout Integrity Engine)",
            },
            {
              "id": "finalizing",
              "progress": 0,
              "status": "pending",
              "subtitle": "تطهير الفراغات وتوليد مستند Word (.docx) محقق 100%",
              "title": "الإخراج والضبط النهائي بالمسطرة",
            },
          ],
        },
        {
          "activeStage": "layout_integrity",
          "stages": [
            {
              "id": "image_denoise",
              "progress": 100,
              "status": "completed",
              "subtitle": "تنقية التشويش، إزالة التحبيب ومعالجة بهتان الوثائق القديمة لتعزيز دقة التعرف",
              "title": "تحسين الصور المشوشة (De-noise)",
            },
            {
              "id": "extraction",
              "progress": 100,
              "status": "completed",
              "subtitle": "تفريغ النصوص والجداول والرموز بدقة عالية",
              "title": "استخراج وقراءة المحتوى والجداول",
            },
            {
              "id": "contextual",
              "progress": 100,
              "status": "completed",
              "subtitle": "مطابقة نصوص ورسم المصحف الشريف وضبط متون كتب الحديث الستة",
              "title": "الفحص السياقي للآيات والأحاديث (Contextual Checker)",
            },
            {
              "id": "grammar",
              "progress": 100,
              "status": "completed",
              "subtitle": "كشف الجمل المفتوحة والبتر المفاجئ وتوقع التكملات الأكاديمية",
              "title": "التحليل النحوي والتركيبي (Grammar Analyzer)",
            },
            {
              "id": "structural",
              "progress": 100,
              "status": "completed",
              "subtitle": "فحص وضبط تسلسل العناوين وفصل الهوامش وترتيب الترقيم الهرمي",
              "title": "التدقيق الهيكلي ومطابقة الترقيم والهوامش (Structural Auditor)",
            },
            {
              "id": "quranic_verification",
              "progress": 100,
              "status": "completed",
              "subtitle": "مطابقة الآيات القرآنية مع المصحف الشريف بالرسم العثماني المعتمد لضمان دقة 100%",
              "title": "التحقق القرآني بالرسم العثماني",
            },
            {
              "id": "layout_integrity",
              "progress": 60,
              "status": "in_progress",
              "subtitle": "فحص هيكلية كل صفحة وتثبيت أبعاد الجداول والقوائم لضمان اتجاه RTL متطابق 100%",
              "title": "معايرة وهيكلة الصفحات والجداول (Layout Integrity Engine)",
            },
            {
              "id": "finalizing",
              "progress": 0,
              "status": "pending",
              "subtitle": "تطهير الفراغات وتوليد مستند Word (.docx) محقق 100%",
              "title": "الإخراج والضبط النهائي بالمسطرة",
            },
          ],
        },
        {
          "activeStage": "finalizing",
          "stages": [
            {
              "id": "image_denoise",
              "progress": 100,
              "status": "completed",
              "subtitle": "تنقية التشويش، إزالة التحبيب ومعالجة بهتان الوثائق القديمة لتعزيز دقة التعرف",
              "title": "تحسين الصور المشوشة (De-noise)",
            },
            {
              "id": "extraction",
              "progress": 100,
              "status": "completed",
              "subtitle": "تفريغ النصوص والجداول والرموز بدقة عالية",
              "title": "استخراج وقراءة المحتوى والجداول",
            },
            {
              "id": "contextual",
              "progress": 100,
              "status": "completed",
              "subtitle": "مطابقة نصوص ورسم المصحف الشريف وضبط متون كتب الحديث الستة",
              "title": "الفحص السياقي للآيات والأحاديث (Contextual Checker)",
            },
            {
              "id": "grammar",
              "progress": 100,
              "status": "completed",
              "subtitle": "كشف الجمل المفتوحة والبتر المفاجئ وتوقع التكملات الأكاديمية",
              "title": "التحليل النحوي والتركيبي (Grammar Analyzer)",
            },
            {
              "id": "structural",
              "progress": 100,
              "status": "completed",
              "subtitle": "فحص وضبط تسلسل العناوين وفصل الهوامش وترتيب الترقيم الهرمي",
              "title": "التدقيق الهيكلي ومطابقة الترقيم والهوامش (Structural Auditor)",
            },
            {
              "id": "quranic_verification",
              "progress": 100,
              "status": "completed",
              "subtitle": "مطابقة الآيات القرآنية مع المصحف الشريف بالرسم العثماني المعتمد لضمان دقة 100%",
              "title": "التحقق القرآني بالرسم العثماني",
            },
            {
              "id": "layout_integrity",
              "progress": 100,
              "status": "completed",
              "subtitle": "فحص هيكلية كل صفحة وتثبيت أبعاد الجداول والقوائم لضمان اتجاه RTL متطابق 100%",
              "title": "معايرة وهيكلة الصفحات والجداول (Layout Integrity Engine)",
            },
            {
              "id": "finalizing",
              "progress": 60,
              "status": "in_progress",
              "subtitle": "تطهير الفراغات وتوليد مستند Word (.docx) محقق 100%",
              "title": "الإخراج والضبط النهائي بالمسطرة",
            },
          ],
        },
      ]
    `);
  });

  it('pins updateStageList at the explicit progress values the app actually passes', () => {
    // These are the exact arguments used at App.tsx:598-705 and documentConverter.ts.
    const calls: Array<[ProcessingStageId, number]> = [
      ['image_denoise', 45],
      ['extraction', 60],
      ['contextual', 60],
      ['grammar', 70],
      ['grammar', 65],
      ['structural', 85],
      ['quranic_verification', 92],
      ['layout_integrity', 95],
      ['finalizing', 98],
    ];
    expect(
      calls.map(([stage, progress]) => ({
        call: `${stage}@${progress}`,
        stages: updateStageList(stage, progress).map(s => `${s.id}:${s.status}:${s.progress}`),
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "call": "image_denoise@45",
          "stages": [
            "image_denoise:in_progress:45",
            "extraction:pending:0",
            "contextual:pending:0",
            "grammar:pending:0",
            "structural:pending:0",
            "quranic_verification:pending:0",
            "layout_integrity:pending:0",
            "finalizing:pending:0",
          ],
        },
        {
          "call": "extraction@60",
          "stages": [
            "image_denoise:completed:100",
            "extraction:in_progress:60",
            "contextual:pending:0",
            "grammar:pending:0",
            "structural:pending:0",
            "quranic_verification:pending:0",
            "layout_integrity:pending:0",
            "finalizing:pending:0",
          ],
        },
        {
          "call": "contextual@60",
          "stages": [
            "image_denoise:completed:100",
            "extraction:completed:100",
            "contextual:in_progress:60",
            "grammar:pending:0",
            "structural:pending:0",
            "quranic_verification:pending:0",
            "layout_integrity:pending:0",
            "finalizing:pending:0",
          ],
        },
        {
          "call": "grammar@70",
          "stages": [
            "image_denoise:completed:100",
            "extraction:completed:100",
            "contextual:completed:100",
            "grammar:in_progress:70",
            "structural:pending:0",
            "quranic_verification:pending:0",
            "layout_integrity:pending:0",
            "finalizing:pending:0",
          ],
        },
        {
          "call": "grammar@65",
          "stages": [
            "image_denoise:completed:100",
            "extraction:completed:100",
            "contextual:completed:100",
            "grammar:in_progress:65",
            "structural:pending:0",
            "quranic_verification:pending:0",
            "layout_integrity:pending:0",
            "finalizing:pending:0",
          ],
        },
        {
          "call": "structural@85",
          "stages": [
            "image_denoise:completed:100",
            "extraction:completed:100",
            "contextual:completed:100",
            "grammar:completed:100",
            "structural:in_progress:85",
            "quranic_verification:pending:0",
            "layout_integrity:pending:0",
            "finalizing:pending:0",
          ],
        },
        {
          "call": "quranic_verification@92",
          "stages": [
            "image_denoise:completed:100",
            "extraction:completed:100",
            "contextual:completed:100",
            "grammar:completed:100",
            "structural:completed:100",
            "quranic_verification:in_progress:92",
            "layout_integrity:pending:0",
            "finalizing:pending:0",
          ],
        },
        {
          "call": "layout_integrity@95",
          "stages": [
            "image_denoise:completed:100",
            "extraction:completed:100",
            "contextual:completed:100",
            "grammar:completed:100",
            "structural:completed:100",
            "quranic_verification:completed:100",
            "layout_integrity:in_progress:95",
            "finalizing:pending:0",
          ],
        },
        {
          "call": "finalizing@98",
          "stages": [
            "image_denoise:completed:100",
            "extraction:completed:100",
            "contextual:completed:100",
            "grammar:completed:100",
            "structural:completed:100",
            "quranic_verification:completed:100",
            "layout_integrity:completed:100",
            "finalizing:in_progress:98",
          ],
        },
      ]
    `);
  });

  it('DEAD BRANCH: omitting stageProgressValue can never produce the 40/50/55… defaults', () => {
    // `createInitialStages` has a per-stage default progress table (40, 50, 55, …). The only
    // caller of that table is `createInitialStages` itself. `updateStageList` OVERWRITES the
    // active stage's progress with `stageProgressValue ?? 60`, so the per-stage defaults are
    // unreachable through this entry point. Every live call site passes an explicit value
    // (App.tsx:598-953, documentConverter.ts:65-721), so this is provably dead.
    // PINNED, NOT FIXED.
    const defaultsReachable = ALL_STAGE_IDS.some(id => {
      const active = updateStageList(id).find(s => s.id === id)!;
      return active.progress === IN_PROGRESS_DEFAULTS[id];
    });
    expect(defaultsReachable).toBe(false);
    expect(updateStageList('extraction').find(s => s.id === 'extraction')!.progress).toBe(60);
    expect(updateStageList('grammar').find(s => s.id === 'grammar')!.progress).toBe(60);
  });

  it('the duplicated stage-order arrays agree: the two functions rank stages identically', () => {
    // `updateStageList` has its own `stageOrder` copy and uses it only for `indexOf`, while the
    // list itself comes from `createInitialStages`. If the copies drift, the returned list and
    // the in_progress marker silently disagree. This asserts they cannot drift today.
    for (const id of ALL_STAGE_IDS) {
      const fromUpdate = updateStageList(id);
      const fromCreate = createInitialStages(id);
      expect(fromUpdate.map(s => s.id)).toEqual(fromCreate.map(s => s.id));
      expect(fromUpdate.findIndex(s => s.status === 'in_progress')).toBe(id === undefined ? -1 : ALL_STAGE_IDS.indexOf(id));
    }
  });

  it('updateStageList never mutates the array it receives from createInitialStages', () => {
    // It spreads each stage (`{ ...stage, ... }`), so the per-stage literal is copied rather
    // than mutated. This pins that the spread is actually needed.
    const first = updateStageList('extraction', 33);
    const second = updateStageList('extraction', 44);
    expect(first).not.toBe(second);
    expect(first.find(s => s.id === 'extraction')!.progress).toBe(33);
    expect(second.find(s => s.id === 'extraction')!.progress).toBe(44);
  });

  it('progress 0 and 100 are honoured verbatim (no clamping)', () => {
    expect(updateStageList('grammar', 0).find(s => s.id === 'grammar')!.progress).toBe(0);
    expect(updateStageList('grammar', 100).find(s => s.id === 'grammar')!.progress).toBe(100);
    expect(updateStageList('grammar', -5).find(s => s.id === 'grammar')!.progress).toBe(-5);
  });
});

describe('D. pipelineStages — StageStatus shape', () => {
  it('every emitted object carries exactly id, title, subtitle, status, progress', () => {
    const keysOf = (s: StageStatus) => Object.keys(s).sort();
    expect(createInitialStages('grammar').map(keysOf)).toMatchInlineSnapshot(`
      [
        [
          "id",
          "progress",
          "status",
          "subtitle",
          "title",
        ],
        [
          "id",
          "progress",
          "status",
          "subtitle",
          "title",
        ],
        [
          "id",
          "progress",
          "status",
          "subtitle",
          "title",
        ],
        [
          "id",
          "progress",
          "status",
          "subtitle",
          "title",
        ],
        [
          "id",
          "progress",
          "status",
          "subtitle",
          "title",
        ],
        [
          "id",
          "progress",
          "status",
          "subtitle",
          "title",
        ],
        [
          "id",
          "progress",
          "status",
          "subtitle",
          "title",
        ],
        [
          "id",
          "progress",
          "status",
          "subtitle",
          "title",
        ],
      ]
    `);
    expect(keysOf(updateStageList('grammar')[0])).toEqual([
      'id',
      'progress',
      'status',
      'subtitle',
      'title',
    ]);
  });
});