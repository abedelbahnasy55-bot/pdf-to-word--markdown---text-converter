import type { CustomSelectOption } from '../components/ui/CustomSelect';
import type { CompilerPipelineProgress } from '../utils/smartCompilerEngine';
import type { FontProfileId } from '../utils/docxExporter';
import { TYPOGRAPHY_PROFILES } from '../utils/docxExporter';
import type { OrganizationMode } from '../../shared/smartCompilerCore';

export interface CompilerPreset {
  label: string;
  text: string;
}

export const PROMPT_PRESETS: CompilerPreset[] = [
  {
    label: 'أسئلة كتاب مرتبة بالفهرس',
    text: 'استخرج كافة الأسئلة والتدريبات من الكتاب المحدد فقط دون الشرح النظري، مرتبة على حسب ترتيبها الأصلي في الدروس والفهرس، مع إبقاء الإجابات إن وجدت وتوحيد ترقيم الأسئلة س١، س٢.',
  },
  {
    label: 'انتقاء دروس واستبعاد أخرى',
    text: 'هات أسئلة وتدريبات الدرس الأول والدرس الثاني فقط على حسب ترتيب الفهرس، وسيب الدرس الثالث دون استخراجه.',
  },
  {
    label: 'فحص فهرس الدروس والسنوات',
    text: 'ما هي الدروس والأبواب والأقسام الموجودة في المصادر المحددة وما هي السنوات المرصودة؟ اعرض الفهرس الكامل.',
  },
  {
    label: 'تجميع امتحانات مع حفظ التكرار',
    text: 'اجمع أسئلة وتدريبات كتاب الشرح مع امتحانات السنوات السابقة كاملة، ورتبها حسب السنة، واحتفظ بالأسئلة المتكررة بين السنوات داخل كل امتحان دون حذف.',
  },
  {
    label: 'امتحانات + ملحق إجابات ختامي',
    text: 'اجمع جميع الامتحانات المتاحة من أحدث سنة إلى أقدم سنة، وانقل الإجابات النموذجية إلى ملحق مستقل في نهاية الملف، مع توحيد ترقيم الأسئلة س١، س٢.',
  },
];

export const QUICK_REFINEMENTS: string[] = [
  'انقل الإجابات في ملحق في الآخر',
  'رتب الامتحانات من الأحدث للأقدم',
  'وحّد ترقيم الأسئلة (س١، س٢)',
  'اجعل العناوين الرئيسية أوضح وأضف مقدمة موجزة',
];

export const PIPELINE_STEPS_ORDER: Array<{
  id: CompilerPipelineProgress['stage'];
  label: string;
}> = [
  { id: 'converting_sources', label: 'تجهيز المصادر' },
  { id: 'planning', label: 'خطة الهيكلة' },
  { id: 'extracting', label: 'الاستخلاص' },
  { id: 'assembling', label: 'الدمج' },
  { id: 'auditing', label: 'التدقيق والختم' },
];

export const ORGANIZATION_OPTIONS: Array<CustomSelectOption<OrganizationMode | 'auto'>> = [
  {
    value: 'auto',
    label: 'تلقائي حسب صياغة الطلب',
    description: 'يستنتج الترتيب الأنسب من أوامرك',
  },
  {
    value: 'by_book_order',
    label: 'ترتيب الدروس والفهرس الأصلي',
    description: 'يلتزم بتسلسل الكتاب الأصلي',
  },
  {
    value: 'by_exam_year',
    label: 'ترتيب زمني بسنوات الامتحانات',
    description: 'يفصل كل سنة امتحانية على حدة',
  },
  {
    value: 'by_source',
    label: 'مجمّع حسب كل كتاب ومصدر',
    description: 'باب مستقل لكل مصدر مختار',
  },
  {
    value: 'unified_bank',
    label: 'بنك أسئلة موحّد',
    description: 'يدمج البنود المتقاربة موضوعياً',
  },
];

export const FONT_PROFILE_OPTIONS: Array<CustomSelectOption<FontProfileId>> = Object.values(
  TYPOGRAPHY_PROFILES
).map((p) => ({
  value: p.id,
  label: `${p.labelArabic} (${p.arabicFont} ${p.arabicBodyPt}pt)`,
}));
