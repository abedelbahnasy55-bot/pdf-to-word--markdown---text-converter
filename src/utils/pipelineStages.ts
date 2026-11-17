import { ProcessingStageId, StageStatus } from '../types';

export function createInitialStages(
  activeStage: ProcessingStageId = 'extraction',
  isEnglish: boolean = false
): StageStatus[] {
  const stageOrder: ProcessingStageId[] = [
    'image_denoise',
    'extraction',
    'contextual',
    'grammar',
    'structural',
    'quranic_verification',
    'layout_integrity',
    'structural_integrity',
    'finalizing'
  ];
  const activeIndex = stageOrder.indexOf(activeStage);

  const getStatus = (id: ProcessingStageId): 'completed' | 'in_progress' | 'pending' => {
    const idx = stageOrder.indexOf(id);
    if (idx < activeIndex) return 'completed';
    if (idx === activeIndex) return 'in_progress';
    return 'pending';
  };

  const getProgress = (id: ProcessingStageId, defaultInProgress: number): number => {
    const idx = stageOrder.indexOf(id);
    if (idx < activeIndex) return 100;
    if (idx === activeIndex) return defaultInProgress;
    return 0;
  };

  if (isEnglish) {
    return [
      {
        id: 'image_denoise',
        title: 'تحسين ومعالجة الصور المشوشة (De-noise)',
        subtitle: 'تنقية التشويش، إزالة التحبيب وتوضيح النصوص لتعزيز دقة التعرف',
        status: getStatus('image_denoise'),
        progress: getProgress('image_denoise', 50),
      },
      {
        id: 'extraction',
        title: 'استخراج المحتوى والجداول (Content & Tables)',
        subtitle: 'تفريغ النصوص والجداول والرموز بدقة عالية',
        status: getStatus('extraction'),
        progress: getProgress('extraction', 40),
      },
      {
        id: 'contextual',
        title: 'التحقق الأكاديمي والمصادر (Contextual & Sources)',
        subtitle: 'مطابقة المصطلحات الأكاديمية والمراجع العلمية',
        status: getStatus('contextual'),
        progress: getProgress('contextual', 55),
      },
      {
        id: 'grammar',
        title: 'التحليل النحوي وبنية الجمل (English Grammar & Syntax)',
        subtitle: 'تدقيق التراكيب والفقرات الإنجليزية وكشف الجمل المفتوحة والبتر المفاجئ',
        status: getStatus('grammar'),
        progress: getProgress('grammar', 70),
      },
      {
        id: 'structural',
        title: 'التدقيق الهيكلي للأبواب والفصول (Structural Auditor)',
        subtitle: 'فحص تسلسل العناوين (H1, H2, H3) والجداول وقوائم الترقيم والهوامش السفلية',
        status: getStatus('structural'),
        progress: getProgress('structural', 85),
      },
      {
        id: 'quranic_verification',
        title: 'التدقيق التيبوغرافي والمعادلات (Typography & Math)',
        subtitle: 'مطابقة المصطلحات اللاتينية والمعادلات الرياضية LaTeX بدقة 100%',
        status: getStatus('quranic_verification'),
        progress: getProgress('quranic_verification', 90),
      },
      {
        id: 'layout_integrity',
        title: 'معايرة الصفحات وتثبيت اتجاه LTR (Layout Integrity Engine)',
        subtitle: 'فحص هيكلية كل صفحة وتثبيت أبعاد الجداول والقوائم لضمان اتجاه LTR متطابق 100%',
        status: getStatus('layout_integrity'),
        progress: getProgress('layout_integrity', 95),
      },
      {
        id: 'structural_integrity',
        title: 'التدقيق البنيوي لملفات DOCX (Structural Integrity Audit)',
        subtitle: 'فحص البنية الشجرية، كشف ومنع التكرار البنيوي، والتحقق من سلامة وسوم XML',
        status: getStatus('structural_integrity'),
        progress: getProgress('structural_integrity', 96),
      },
      {
        id: 'finalizing',
        title: 'الإخراج والضبط النهائي بالمسطرة',
        subtitle: 'تطهير الفراغات وتوليد مستند Word (.docx) منسق باحترافية',
        status: getStatus('finalizing'),
        progress: getProgress('finalizing', 98),
      },
    ];
  }

  return [
    {
      id: 'image_denoise',
      title: 'تحسين الصور المشوشة (De-noise)',
      subtitle: 'تنقية التشويش، إزالة التحبيب ومعالجة بهتان الوثائق القديمة لتعزيز دقة التعرف',
      status: getStatus('image_denoise'),
      progress: getProgress('image_denoise', 50),
    },
    {
      id: 'extraction',
      title: 'استخراج وقراءة المحتوى والجداول',
      subtitle: 'تفريغ النصوص والجداول والرموز بدقة عالية',
      status: getStatus('extraction'),
      progress: getProgress('extraction', 40),
    },
    {
      id: 'contextual',
      title: 'الفحص السياقي للآيات والأحاديث (Contextual Checker)',
      subtitle: 'مطابقة نصوص ورسم المصحف الشريف وضبط متون كتب الحديث الستة',
      status: getStatus('contextual'),
      progress: getProgress('contextual', 55),
    },
    {
      id: 'grammar',
      title: 'التحليل النحوي والتركيبي (Grammar Analyzer)',
      subtitle: 'كشف الجمل المفتوحة والبتر المفاجئ وتوقع التكملات الأكاديمية',
      status: getStatus('grammar'),
      progress: getProgress('grammar', 70),
    },
    {
      id: 'structural',
      title: 'التدقيق الهيكلي ومطابقة الترقيم والهوامش (Structural Auditor)',
      subtitle: 'فحص وضبط تسلسل العناوين وفصل الهوامش وترتيب الترقيم الهرمي',
      status: getStatus('structural'),
      progress: getProgress('structural', 85),
    },
    {
      id: 'quranic_verification',
      title: 'التحقق القرآني بالرسم العثماني',
      subtitle: 'مطابقة الآيات القرآنية مع المصحف الشريف بالرسم العثماني المعتمد لضمان دقة 100%',
      status: getStatus('quranic_verification'),
      progress: getProgress('quranic_verification', 90),
    },
    {
      id: 'layout_integrity',
      title: 'معايرة وهيكلة الصفحات والجداول (Layout Integrity Engine)',
      subtitle: 'فحص هيكلية كل صفحة وتثبيت أبعاد الجداول والقوائم لضمان اتجاه RTL متطابق 100%',
      status: getStatus('layout_integrity'),
      progress: getProgress('layout_integrity', 95),
    },
    {
      id: 'structural_integrity',
      title: 'التدقيق البنيوي لملفات DOCX (Structural Integrity Audit)',
      subtitle: 'فحص البنية الشجرية، كشف ومنع التكرار البنيوي، والتحقق من سلامة وسوم XML والتظليل',
      status: getStatus('structural_integrity'),
      progress: getProgress('structural_integrity', 96),
    },
    {
      id: 'finalizing',
      title: 'الإخراج والضبط النهائي بالمسطرة',
      subtitle: 'تطهير الفراغات وتوليد مستند Word (.docx) محقق 100%',
      status: getStatus('finalizing'),
      progress: getProgress('finalizing', 98),
    },
  ];
}

export function updateStageList(
  activeStage: ProcessingStageId,
  stageProgressValue?: number,
  isEnglish: boolean = false
): StageStatus[] {
  const stageOrder: ProcessingStageId[] = [
    'image_denoise',
    'extraction',
    'contextual',
    'grammar',
    'structural',
    'quranic_verification',
    'layout_integrity',
    'structural_integrity',
    'finalizing'
  ];
  const activeIndex = stageOrder.indexOf(activeStage);

  return createInitialStages(activeStage, isEnglish).map((stage, idx) => {
    if (idx < activeIndex) {
      return { ...stage, status: 'completed', progress: 100 };
    }
    if (idx === activeIndex) {
      return {
        ...stage,
        status: 'in_progress',
        progress: stageProgressValue !== undefined ? stageProgressValue : 60,
      };
    }
    return { ...stage, status: 'pending', progress: 0 };
  });
}
