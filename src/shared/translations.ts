type Lang = "en" | "ar";

const T: Record<string, Record<Lang, string>> = {
  // ── Common ──────────────────────────────────────────────────────────────────
  "common.email":          { en: "Email",           ar: "البريد الإلكتروني" },
  "common.password":       { en: "Password",        ar: "كلمة المرور" },
  "common.settings":       { en: "Settings",        ar: "الإعدادات" },
  "common.signOut":        { en: "Sign out",        ar: "تسجيل الخروج" },
  "common.back":           { en: "← Back",          ar: "رجوع →" },
  "common.loading":        { en: "Loading...",      ar: "جارٍ التحميل..." },
  "common.dashboard":      { en: "Dashboard",       ar: "لوحة التحكم" },
  "common.profile":        { en: "Profile",         ar: "الملف الشخصي" },
  "common.messages":       { en: "Messages",        ar: "الرسائل" },
  "common.proposals":      { en: "Proposals",       ar: "العروض" },
  "common.verification":   { en: "Verification",    ar: "التحقق" },
  "common.notifications":  { en: "Notifications",   ar: "الإشعارات" },
  "common.markAllRead":    { en: "Mark all read",   ar: "وضع الكل كمقروء" },
  "common.noNotifs":       { en: "No notifications yet", ar: "لا توجد إشعارات بعد" },
  "common.mfa":            { en: "Two-factor auth", ar: "المصادقة الثنائية" },
  "common.logIn":          { en: "Log in",          ar: "تسجيل الدخول" },
  "common.signUp":         { en: "Sign up",         ar: "إنشاء حساب" },

  // ── Login ────────────────────────────────────────────────────────────────────
  "login.title":           { en: "Welcome back",                             ar: "مرحباً بعودتك" },
  "login.subtitle":        { en: "Log in to your SkillLink account",         ar: "سجّل الدخول إلى حساب SkillLink" },
  "login.forgotPassword":  { en: "Forgot password?",                         ar: "نسيت كلمة المرور؟" },
  "login.submit":          { en: "Log in",                                   ar: "تسجيل الدخول" },
  "login.submitting":      { en: "Logging in...",                            ar: "جارٍ تسجيل الدخول..." },
  "login.noAccount":       { en: "Don't have an account?",                   ar: "ليس لديك حساب؟" },
  "login.err.empty":       { en: "Please enter your email and password.",    ar: "يرجى إدخال البريد الإلكتروني وكلمة المرور." },
  "login.err.failed":      { en: "Login failed. Please try again.",          ar: "فشل تسجيل الدخول. حاول مرة أخرى." },
  "login.mfa.title":       { en: "Two-factor authentication",                ar: "المصادقة الثنائية" },
  "login.mfa.instruction": { en: "Enter the 6-digit code from your authenticator app for", ar: "أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة لـ" },
  "login.mfa.verify":      { en: "Verify code",                              ar: "تحقق من الرمز" },
  "login.mfa.verifying":   { en: "Verifying...",                             ar: "جارٍ التحقق..." },
  "login.mfa.back":        { en: "← Back to login",                         ar: "العودة إلى تسجيل الدخول →" },
  "login.mfa.hint":        { en: "Code refreshes every 30 seconds. Use Google Authenticator or Authy.", ar: "يتجدد الرمز كل 30 ثانية. استخدم Google Authenticator أو Authy." },
  "login.mfa.err.digits":  { en: "Please enter all 6 digits of your authenticator code.", ar: "يرجى إدخال جميع الأرقام الستة لرمز المصادقة." },
  "login.mfa.err.invalid": { en: "Invalid MFA code. Please try again.",     ar: "رمز المصادقة غير صحيح. حاول مرة أخرى." },

  // ── Register ─────────────────────────────────────────────────────────────────
  "reg.title":             { en: "Create your account",                      ar: "إنشاء حسابك" },
  "reg.subtitle":          { en: "Join SkillLink and start today",           ar: "انضم إلى SkillLink وابدأ اليوم" },
  "reg.iAm":               { en: "I am a...",                                ar: "أنا..." },
  "reg.role.freelancer":   { en: "Freelancer",                               ar: "مستقل" },
  "reg.role.freelancerDesc": { en: "I want to find work and projects",       ar: "أريد إيجاد عمل ومشاريع" },
  "reg.role.client":       { en: "Client",                                   ar: "عميل" },
  "reg.role.clientDesc":   { en: "I want to hire skilled talent",            ar: "أريد توظيف مواهب ماهرة" },
  "reg.company":           { en: "Company",                                  ar: "الشركة" },
  "reg.companyPlaceholder":{ en: "Search or type your company name…",        ar: "ابحث أو اكتب اسم شركتك..." },
  "reg.companyHint":       { en: "Search existing companies or type a new name to create one.", ar: "ابحث في الشركات الموجودة أو اكتب اسمًا جديدًا." },
  "reg.passwordPlaceholder":{ en: "Min. 8 chars, 1 uppercase, 1 number",    ar: "8 أحرف على الأقل، حرف كبير، رقم" },
  "reg.confirmPassword":   { en: "Confirm Password",                         ar: "تأكيد كلمة المرور" },
  "reg.confirmPlaceholder":{ en: "Repeat your password",                     ar: "أعد إدخال كلمة المرور" },
  "reg.submit":            { en: "Create account",                           ar: "إنشاء الحساب" },
  "reg.submitting":        { en: "Creating account...",                      ar: "جارٍ إنشاء الحساب..." },
  "reg.hasAccount":        { en: "Already have an account?",                 ar: "لديك حساب بالفعل؟" },
  "reg.success":           { en: "Account created! Please check your email to activate your account.", ar: "تم إنشاء الحساب! يرجى التحقق من بريدك الإلكتروني لتفعيل حسابك." },
  "reg.err.failed":        { en: "Registration failed. Please try again.",   ar: "فشل التسجيل. حاول مرة أخرى." },
  "reg.err.email":         { en: "Please enter a valid email address.",      ar: "يرجى إدخال عنوان بريد إلكتروني صحيح." },
  "reg.err.pw8":           { en: "Password must be at least 8 characters.",  ar: "يجب أن تكون كلمة المرور 8 أحرف على الأقل." },
  "reg.err.pwUpper":       { en: "Password must contain at least one uppercase letter.", ar: "يجب أن تحتوي كلمة المرور على حرف كبير واحد على الأقل." },
  "reg.err.pwNum":         { en: "Password must contain at least one number.", ar: "يجب أن تحتوي كلمة المرور على رقم واحد على الأقل." },
  "reg.err.pwMatch":       { en: "Passwords do not match.",                  ar: "كلمتا المرور غير متطابقتين." },
  "reg.err.company":       { en: "Company name is required for clients.",    ar: "اسم الشركة مطلوب للعملاء." },
  "reg.err.duplicate":     { en: "An account with this email already exists.", ar: "يوجد حساب بهذا البريد الإلكتروني بالفعل." },
  "reg.pw.chars":          { en: "8+ characters",                            ar: "٨+ أحرف" },
  "reg.pw.upper":          { en: "Uppercase letter",                         ar: "حرف كبير" },
  "reg.pw.num":            { en: "Number",                                   ar: "رقم" },

  // ── Freelancer Dashboard ──────────────────────────────────────────────────────
  "fl.section.main":       { en: "Main",            ar: "الرئيسية" },
  "fl.section.skilllink":  { en: "Skillink",        ar: "سكيل لينك" },
  "fl.nav.aiMatches":      { en: "AI Matches",      ar: "تطابقات الذكاء الاصطناعي" },
  "fl.nav.workrooms":      { en: "Workrooms",       ar: "غرف العمل" },
  "fl.nav.upgradeNow":     { en: "Upgrade Now",     ar: "ترقية الآن" },
  "fl.nav.viewPlans":      { en: "View Plans →",    ar: "← عرض الخطط" },
  "fl.nav.updateGithub":   { en: "Update GitHub",   ar: "تحديث GitHub" },
  "fl.metric.ghScore":     { en: "GH SCORE",        ar: "نقاط GH" },
  "fl.metric.rate":        { en: "RATE",            ar: "السعر" },
  "fl.metric.wallet":      { en: "WALLET",          ar: "المحفظة" },
  "fl.welcome":            { en: "Welcome back, {name} — your AI match engine is active", ar: "مرحباً، {name} — محرك التطابق بالذكاء الاصطناعي نشط" },
  "fl.earnings":           { en: "Earnings",        ar: "الأرباح" },
  "fl.recentProposals":    { en: "Recent Proposals", ar: "العروض الأخيرة" },
  "fl.noProposals":        { en: "No proposals yet", ar: "لا توجد عروض بعد" },
  "fl.noProposalsHint":    { en: "Browse projects and submit your first proposal", ar: "تصفح المشاريع وقدّم أول عرض لك" },

  // ── Client Dashboard ─────────────────────────────────────────────────────────
  "cl.section.hiring":     { en: "Hiring",              ar: "التوظيف" },
  "cl.nav.companyProfile": { en: "Company Profile",     ar: "ملف الشركة" },
  "cl.nav.findTalent":     { en: "Find Talent",         ar: "البحث عن مواهب" },
  "cl.nav.activeProjects": { en: "Active Projects",     ar: "المشاريع النشطة" },
  "cl.nav.invoices":       { en: "Invoices",            ar: "الفواتير" },
  "cl.postProject":        { en: "+ Post Project",      ar: "+ نشر مشروع" },
  "cl.stat.projects":      { en: "PROJECTS",            ar: "المشاريع" },
  "cl.stat.hired":         { en: "HIRED",               ar: "المُوظَّفون" },
  "cl.stat.active":        { en: "ACTIVE",              ar: "نشط" },
  "cl.stat.spent":         { en: "SPENT",               ar: "المنفق" },
  "cl.stat.openProjects":  { en: "Open Projects",       ar: "المشاريع المفتوحة" },
  "cl.stat.activeContracts":{ en: "Active Contracts",   ar: "العقود النشطة" },
  "cl.stat.completed":     { en: "Completed",           ar: "مكتملة" },
  "cl.stat.totalProjects": { en: "Total Projects",      ar: "إجمالي المشاريع" },
  "cl.stat.talentHired":   { en: "Talent Hired",        ar: "المواهب المُوظَّفة" },
  "cl.stat.totalBudget":   { en: "Total Budget",        ar: "إجمالي الميزانية" },
  "cl.action.postProject": { en: "Post New Project",    ar: "نشر مشروع جديد" },
  "cl.action.findTalent":  { en: "Find Talent",         ar: "البحث عن مواهب" },
  "cl.action.viewContracts":{ en: "View Contracts",     ar: "عرض العقود" },

  // ── Contracts List ───────────────────────────────────────────────────────────
  "contracts.title":       { en: "Contracts",           ar: "العقود" },
  "contracts.summary":     { en: "{total} total · {active} active", ar: "{total} إجمالي · {active} نشط" },
  "contracts.all":         { en: "All",                 ar: "الكل" },
  "contracts.active":      { en: "Active",              ar: "نشط" },
  "contracts.completed":   { en: "Completed",           ar: "مكتمل" },
  "contracts.disputed":    { en: "Disputed",            ar: "متنازع" },
  "contracts.loading":     { en: "Loading contracts…",  ar: "جارٍ تحميل العقود..." },
  "contracts.empty":       { en: "No contracts here",   ar: "لا توجد عقود هنا" },
  "contracts.emptyAll":    { en: "You don't have any contracts yet.", ar: "ليس لديك أي عقود بعد." },
  "contracts.emptyFilter": { en: "No {filter} contracts.", ar: "لا توجد عقود {filter}." },
  "contracts.started":     { en: "Started",             ar: "بدأ" },
};

export type TranslationKey = keyof typeof T;

export function translate(key: string, lang: Lang, vars?: Record<string, string | number>): string {
  const entry = T[key];
  if (!entry) return key;
  let str = entry[lang] ?? entry.en ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(`{${k}}`, String(v));
    }
  }
  return str;
}

export type { Lang };
