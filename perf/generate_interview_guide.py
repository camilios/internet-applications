"""Generate the Arabic k6 interview walkthrough from project source and evidence."""
from pathlib import Path
from html import escape
import json
import subprocess
from statistics import median

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'K6_INTERVIEW_AR.html'
summary = json.loads((ROOT/'docs/performance/results/summary.json').read_text())
dashboard = summary['dashboard']

def code(text, label='أوامر Ubuntu / WSL'):
    return f'<div class="code"><div class="bar"><span>{escape(label)}</span><button type="button" class="copy">نسخ</button></div><pre dir="ltr"><code>{escape(text.strip())}</code></pre></div>'

def say(text):
    return '<div class="say"><strong>قل للدكتور:</strong><p>'+text+'</p></div>'

def section(sid, title, content):
    return f'<section id="{sid}"><h2>{title}</h2>{content}</section>'

start = '''cd /mnt/e/projects/internet-applications
docker compose up -d --no-build --wait backend inventory-service scheduler redis
docker compose ps
curl -fsS http://localhost:8000/up
docker run --rm grafana/k6:latest version'''
live = 'bash perf/interview_run.sh dashboard'
saved = 'python3 perf/interview_compare.py --scenario dashboard'
explain = r'''docker exec -i ecommerce-backend php <<'PHP'
<?php
require '/var/www/html/vendor/autoload.php';
$app = require '/var/www/html/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$sql = 'EXPLAIN ANALYZE SELECT * FROM orders ORDER BY created_at DESC LIMIT 15';
foreach (Illuminate\Support\Facades\DB::select($sql) as $row) {
    echo $row->EXPLAIN, PHP_EOL;
}
PHP'''
old = subprocess.run(['git','show','b9514cbe00b7d310cc2972aff728a9d690bc2a3b:backend/my-project/app/Http/Controllers/DashboardController.php'],cwd=ROOT,capture_output=True,text=True,encoding='utf-8',check=True).stdout
new = (ROOT/'backend/my-project/app/Http/Controllers/DashboardController.php').read_text()
rowlabels = [('baseline','قبل التحسينات'),('after-indexes','بعد الفهارس'),('after-dashboard','بعد تعديل الداشبورد'),('after-redis','بعد Redis'),('after-refactor','بعد تنظيم الكود')]
rows=''.join(f'<tr><th>{label}</th><td>{dashboard[stage]["p(50)"]:.3f}</td><td>{dashboard[stage]["p(95)"]:.3f}</td><td>{dashboard[stage]["p(99)"]:.3f}</td><td>{dashboard[stage]["rps"]:.3f}</td><td>{dashboard[stage]["error_percent"]:.3f}%</td></tr>' for stage,label in rowlabels)
reduction=(1-dashboard['after-refactor']['p(95)']/dashboard['baseline']['p(95)'])*100
rehearsal=''
comparisons=sorted((ROOT/'docs/performance/interview').glob('*/dashboard/comparison.txt'),key=lambda p:p.stat().st_mtime)
if comparisons:
    folder=comparisons[-1].parent
    live_metrics=[json.loads((folder/f'k6-dashboard-{run}.json').read_text())['metrics'] for run in range(1,4)]
    live_p95=median(m['endpoint_duration']['p(95)'] for m in live_metrics)
    errors=max(100*m['endpoint_errors']['value'] for m in live_metrics)
    link=(folder/'comparison.txt').relative_to(ROOT).as_posix()
    rehearsal=f'<div class="notice"><strong>تجربة فعلية للأمر أثناء تجهيز هذا الدليل:</strong> اكتملت ثلاث تشغيلات، وكان وسيط p95 الجديد <bdi>{live_p95:.3f} ms</bdi>، وأقصى نسبة أخطاء بين التشغيلات <bdi>{errors:.3f}٪</bdi>. هذا رقم جديد منفصل عن AFTER التاريخي <bdi>28.011 ms</bdi>. <a href="{link}">مخرجات التجربة ومصادرها</a>. لا تحفظ الرقم الجديد بوصفه وعدًا لنتيجة المقابلة.</div>'

content=[]
content.append(section('honesty','01 · ما المقصود بـ«قبل وبعد» في هذا العرض؟',f'''
<p>المشروع الحالي يحتوي الفهارس وRedis والكاش وبقية التحسينات. تشغيل k6 عليه الآن يقيس <strong>الحالة الحالية بعد التحسين</strong>. قياسات «قبل» الأصلية محفوظة من تشغيلات سابقة قبل التحسينات، وليست أرقامًا مفترضة.</p>
<div class="notice"><strong>لا تقل إنك شغّلت النسخة القديمة الآن.</strong> أمر المقابلة سيعرض ثلاثة عناوين واضحة: <bdi>ARCHIVED BEFORE</bdi> و<bdi>ARCHIVED AFTER</bdi> و<bdi>LIVE CURRENT (AFTER)</bdi>. الأولان أدلة سابقة، والثالث نتيجة حية وقت العرض.</div>
{say('«قست قبل التعديلات وبعدها على البيانات نفسها وبنفس إعداد k6. هذه ملفات التشغيل الأصلية. سأشغّل الآن النسخة المحسّنة أمامك، وأقارن النتيجة الجديدة بالأدلة المحفوظة، مع توضيح أن ظروف اللابتوب قد تختلف.»')}
<p class="muted">إذا طلب الدكتور تشغيل النسخة القديمة والجديدة كلتيهما مباشرة، تحتاج بيئتين معزولتين ونسخة قاعدة متطابقة قبل الفهارس. ذلك لم يُجهّز في هذا العرض. تعطيل Redis أو مسح الكاش لا يعيد جميع التحسينات، وعمل git checkout وحده لا يزيل الفهارس. لا تغيّر قاعدة المشروع أو تتراجع عن migrations أثناء المقابلة.</p>'''))
content.append(section('terminal','02 · افتح Linux Terminal وجهّز الخدمات',f'''
<ol><li>افتح مجلد <bdi>E:\\projects\\internet-applications</bdi> في VS Code.</li><li>اختر <bdi>Terminal → New Terminal</bdi> ثم <bdi>Ubuntu (WSL)</bdi> من قائمة الطرفية.</li><li>إذا كانت الطرفية PowerShell، اكتب <code class="inline">wsl -d Ubuntu</code> أولًا. بعد ظهور موجه Linux استخدم الأوامر التالية.</li></ol>
{code(start)}
<p>المتوقع: خدمات backend وMySQL والمخزون وRedis سليمة؛ scheduler يعمل. فحص <bdi>/up</bdi> ينجح، ويظهر إصدار k6 المثبت داخل صورة Docker. قد يظهر HTML طويل من فحص الصحة؛ هذا طبيعي. لا تحتاج تثبيت k6 على Windows أو تشغيل الواجهة الأمامية لهذا الاختبار.</p>
<p class="muted">الأوامر تستخدم الصورة المحلية الموجودة؛ لا تحدّث grafana/k6:latest قبل المقابلة. اسم latest وحده لا يضمن الإصدار نفسه على جهاز آخر. أبقِ جلسة Ubuntu مفتوحة حتى لا تتوقف بيئة WSL.</p>
{say('«أداة k6 تعمل داخل حاوية Docker، وترسل HTTP إلى Laravel عبر شبكة المشروع. Laravel يتعامل مع MySQL وRedis، ويستخدم gRPC للمخزون عند طلب تفاصيل المنتج. إذن أختبر API مباشرة، وليس سرعة رسم صفحات React.»')}'''))
content.append(section('run','03 · نفّذ العرض الحي بأمر واحد',f'''
{code(live)}
<p>هذا الأمر يستعمل <bdi>perf/interview_run.sh</bdi> الذي أُضيف لهذا العرض. يشغّل السيناريو نفسه <strong>ثلاث مرات متتالية</strong>؛ مدة الحمل لكل مرة 30 ثانية تقريبًا، ثم توجد كلفة بدء الحاوية والمقارنة. يعرض تقدم k6 ثم جدول المقارنة تلقائيًا.</p>
<div class="flow"><div><strong>5 ثوانٍ</strong>صعود تدريجي إلى 5 مستخدمين افتراضيين</div><div><strong>20 ثانية</strong>ثبات عند 5 VUs</div><div><strong>5 ثوانٍ</strong>هبوط تدريجي إلى صفر</div></div>
<p>كل مستخدم ينتظر ثانية بين الطلبات. السكربت يسجّل الدخول بحساب bulk تجريبي، ثم يقيس <bdi>GET /api/dashboard</bdi>. لا ينشئ طلبات شراء ولا يعيد البذر. يسجل أعداد الجداول قبل الحمل وينبّه إذا اختلفت عن خط الأساس.</p>
<p class="muted">النتائج الجديدة تحفظ تحت <bdi>docs/performance/interview/&lt;وقت-ومعرّف-التشغيل&gt;/dashboard/</bdi>. لا تُستبدل ملفات baseline أو النتائج التاريخية. تُحفظ JSON وlog وcomparison.txt وإصدار k6 وأعداد الصفوف.</p>
{say('«أكرر كل اختبار ثلاث مرات وأستخدم وسيط نتائج التشغيلات لتقليل تأثير التذبذب. هذا وسيط p95 لكل تشغيل، وليس p95 محسوبًا من دمج جميع عينات التشغيلات. وأفحص الأخطاء قبل أن أقول إن النتيجة أسرع.»')}
<details><summary>ما الذي ينفذه Docker فعليًا؟ مثال لمرة واحدة فقط</summary><p>الأمر التالي يشغّل مرة واحدة ويحفظها منفصلة. العرض الموصى به يستخدم الأمر الأعلى لأنه يشغّل ثلاث مرات ويحسب المقارنة.</p>{code('''demo="docs/performance/interview/manual-$(date +%Y%m%d-%H%M%S)-$$"
mkdir -p "$demo"
docker run --rm --network internet-applications_ecommerce-network --user 0 \\
  -v "$PWD/perf/k6:/scripts:ro" \\
  -v "$PWD/$demo:/evidence" \\
  -e RUN_ID=210 \\
  grafana/k6:latest run --no-thresholds \\
  --summary-export /evidence/k6-dashboard-1.json \\
  /scripts/dashboard.js''')}</details>'''))
content.append(section('metrics','04 · اقرأ شاشة k6 بطريقة صحيحة','''
<div class="tablewrap"><table><thead><tr><th>المصطلح</th><th>التفسير الذي تقوله</th><th>ما تنتبه له</th></tr></thead><tbody>
<tr><th><bdi>endpoint_duration</bdi></th><td>مدة طلب نقطة النهاية فقط؛ نقيسها من response.timings.duration.</td><td>هذا هو أساس جداولنا. تسجيل الدخول في setup لا يدخل هذا المقياس المخصص.</td></tr>
<tr><th><bdi>p50 / p95 / p99</bdi></th><td>50٪ / 95٪ / 99٪ من مدد العينات لا تتجاوز القيمة تقريبًا. الوحدة ms.</td><td>p95 يوضح الطرف البطيء للتوزيع، وليس المتوسط. الأقل أسرع عند ثبات الحمل والأخطاء.</td></tr>
<tr><th><bdi>endpoint_errors</bdi></th><td>نسبة الاستجابات التي ليست 200 أو 304 في سيناريوهات القراءة هذه.</td><td>قيمة 0٪ تعني عدم رصد هذا النوع من الأخطاء في التشغيل. السكربت يرفض المقارنة إذا وجد أخطاء في أي تشغيل.</td></tr>
<tr><th><bdi>http_reqs / req/s</bdi></th><td>عدد طلبات HTTP ومعدلها في الثانية.</td><td>يتضمن تسجيل الدخول. وجود sleep وثبات عدد VUs يجعل RPS محدودًا؛ لا أقدمه كسعة النظام القصوى.</td></tr>
<tr><th><bdi>data_received</bdi></th><td>إجمالي البيانات المستقبلة أثناء التشغيل.</td><td>يُفيد في شرح ETag، لكن مقدارَه يتأثر بعدد الطلبات والردود؛ ليس حجم JSON واحد.</td></tr>
<tr><th><bdi>checks</bdi></th><td>تحققنا من حالة HTTP المتوقعة.</td><td>نجاحه لا يثبت كل صحة العمل التجاري. لدينا اختبارات مستقلة لصحة الطلبات والمخزون.</td></tr>
<tr><th><bdi>thresholds</bdi></th><td>أهداف يمكن أن تجعل الاختبار يفشل عند تجاوزها.</td><td>تشغيل المقارنة هنا يستخدم --no-thresholds مثل القياسات السابقة؛ نجاح خروج k6 ليس دليلًا على اجتياز أهداف الأداء.</td></tr>
</tbody></table></div>
<p class="muted">http_req_duration يشمل إرسال الطلب وانتظار الاستجابة واستقبالها، ولا يشمل DNS وبدء الاتصال. iteration_duration يتضمن sleep؛ لذلك لا تخلطه مع مدة طلب API. حدود الأداء المعرّفة في المصدر موجودة، لكنها غير مطبقة كبوابة نجاح في تشغيلنا هذا.</p>'''))
content.append(section('numbers','05 · أظهر الفرق بالأرقام الأصلية',f'''
{code(saved)}
<p>هذا الأمر لا يشغّل حملًا جديدًا: يقرأ ملفات JSON الثلاثة الأصلية لكل جانب ويطبع قيم كل تشغيل والوسيط. الأمر الحي في الخطوة 03 ينفذ المقارنة نفسها ويضيف نتيجة التشغيل الجديد.</p>
<div class="tablewrap"><table><caption>لوحة التحكم — وسيط 3 تشغيلات لكل مرحلة، الأزمان بالمللي ثانية</caption><thead><tr><th>المرحلة</th><th>p50</th><th>p95</th><th>p99</th><th>req/s</th><th>أخطاء</th></tr></thead><tbody>{rows}</tbody></table></div>
<p>الفرق التاريخي في p95 من <bdi>152.890</bdi> إلى <bdi>28.011 ms</bdi>. نسبة انخفاض p95 المحسوبة من القياسات ≈ <strong>{reduction:.2f}٪</strong> وفق <bdi>(قبل − بعد) ÷ قبل × 100</bdi>. هذه نسبة لهذا المقياس في هذه التجربة، وليست وعدًا بتسريع كل جزء بالنسبة نفسها.</p>
{say('«التحسن جاء عبر خطوات: فهارس، ثم تجميع استعلام الداشبورد وكاش لمدة 60 ثانية، ثم Redis، ثم تنظيم الكود. لا أنسب الفرق الكامل إلى Redis وحده. نرى كذلك أن p50 بعد الفهارس وحدها لم يتحسن؛ النتائج ليست كلها إيجابية.»')}
<p class="muted">أعداد البيانات التاريخية: 5,004 مستخدمين، 15 منتجًا، 300,004 طلبات و749,372 عنصر طلب. المستخدم bulk-customer-1 يرى نطاق طلباته، لا جميع 300 ألف طلب. يظهر الحمل الكبير بوضوح أيضًا في خطط قوائم المدير؛ لا تصف اختبار الداشبورد هذا بأنه اختبار مدير إن كنت تستخدم السكربت الحالي.</p>'''))
content[-1]=content[-1].replace('</section>',rehearsal+'</section>')
content.append(section('changes','06 · اربط كل نتيجة بالكود الذي تغيّر',f'''
<div class="tablewrap"><table><thead><tr><th>التغيير</th><th>قبل</th><th>بعد</th><th>الشرح أمام الدكتور</th></tr></thead><tbody>
<tr><th>فهارس MySQL</th><td>بعض قوائم الطلبات تفحص عددًا كبيرًا من الصفوف وتفرزها.</td><td>فهارس user/date وstatus/date وcreated_at، وفهارس للمنتجات.</td><td>تساعد التصفية والترتيب؛ اختيار الفهرس يعود للمحسن. جدول المنتجات صغير وقد يختار مسحًا.</td></tr>
<tr><th>استعلام الداشبورد</th><td>استعلامات count/sum منفصلة للطلبات في كل طلب HTTP.</td><td>تجميع COUNT وSUM وCASE، مع شرط العميل.</td><td>قلّلنا تكرار العمل مع حفظ نفس مفاتيح JSON ونوع المبيعات العشري.</td></tr>
<tr><th>كاش الداشبورد</th><td>حساب الأرقام عند كل قراءة.</td><td>Cache::remember لمدة 60 ثانية؛ مفتاح لكل عميل ومفتاح للمدير.</td><td>القراءة الدافئة تعيد نتيجة سابقة؛ الكتابة تبطلها فورًا للعميل المعني والمدير.</td></tr>
<tr><th>Redis</th><td>مخزن الكاش السابق database.</td><td>خدمة Redis مشتركة للخادم والمجدول وعميل phpredis.</td><td>قلّلنا الاعتماد على قاعدة البيانات لقراءة الكاش؛ Redis يستهلك ذاكرة وله حدود وسياسة إخلاء.</td></tr>
<tr><th>بيانات المنتج</th><td>تحميل التصنيف عند كل قراءة.</td><td>لقطة 300 ثانية نعيد منها علاقة التصنيف فقط؛ stock مستبعد.</td><td>السعر والظهور من قاعدة التطبيق والمخزون حي عبر gRPC؛ لا نعرض مخزونًا قديمًا لتجميل الأداء.</td></tr>
<tr><th>ETag</th><td>إرسال JSON كاملًا كل مرة.</td><td>هاش للاستجابة النهائية و304 عند عدم التغيير.</td><td>يقلل النقل أساسًا؛ لا يلغي استدعاء المخزون. قياسنا لم يثبت تقليل زمن details في هذه الخطوة.</td></tr>
<tr><th>ثبات الصفحات</th><td>ترتيب created_at وحده يلتبس عند تساويه.</td><td>created_at ثم id تنازليًا.</td><td>تغيير صحة وترتيب، مع الحفاظ على إجماليات pagination.</td></tr>
<tr><th>الإشعار والواجهة</th><td>الإشعار داخل معاملة الإنشاء، ومفاتيح جديدة عند إعادة المحاولة، ونقص تحديث الاستعلامات.</td><td>الإشعار بعد commit مع logging؛ مفتاح ثابت لنفس المحاولة وإبطال استعلامات الواجهة.</td><td>هذه صحة عمل وتقليل زمن داخل المعاملة، وليست السبب المباشر لتحسن GET dashboard في k6.</td></tr>
</tbody></table></div>
{code('''sed -n '15,80p' backend/my-project/app/Http/Controllers/DashboardController.php
cat backend/my-project/app/Services/DashboardCache.php''','أظهر الكود الحالي في الطرفية')}
<details><summary>كود DashboardController قبل التحسين — من Git الأصلي</summary>{code(old,'PHP · النسخة الأصلية')}</details>
<details><summary>كود DashboardController بعد التحسين — النسخة الحالية</summary>{code(new,'PHP · النسخة الحالية')}</details>
{say('«عند عدم وجود كاش نحسب القيم ونحفظها. عند وجوده نقرأها حتى 60 ثانية. بعد إنشاء طلب أو تغيير حالته نمسح كاش المستخدم والمدير. إذن لم أضحِّ بعرض الطلب الجديد من أجل سرعة القراءة.»')}
<p><a href="CHANGES_EXPLAINED_AR.html">الشرح التفصيلي السابق لكل الملفات مع الكود الكامل</a> متاح إذا طلب الدكتور تفاصيل أوسع.</p>'''))
content.append(section('sql','07 · اختياري: أظهر أثر الفهرس في EXPLAIN',f'''
<p>بعد عرض k6، يمكنك تشغيل هذا الاستعلام القرائي على <strong>الحالة الحالية</strong>. لا يغير قاعدة البيانات، ولا يعرض كلمات المرور.</p>{code(explain)}
<p>ابحث عن اسم فهرس <bdi>orders_created_idx</bdi> وعدد الصفوف الفعلي في خطة هذا الاستعلام. الأوقات الجديدة قد تختلف عن المحفوظة؛ لا تستبدل قياس «قبل» بوقت جديد من قاعدة مفهرسة.</p>
{code('''cat docs/performance/results/explain-summary.json''','عرض ملخص EXPLAIN الأصلي قبل/بعد')}
{say('«في القياس المحفوظ لقائمة الطلبات غير المصفاة، انخفضت الصفوف الخارجة من مسح المصدر من 300,004 إلى 15 مع الفهرس وLIMIT. هذا ليس عدد الصفوف المقدّر؛ فرّقت في التقرير بين estimates وactual rows. العدّ الشامل لم يتحسن في قياسنا، ولذلك لا أقول إن كل استعلام صار أسرع.»')}'''))
content.append(section('others','08 · اختياري: اعرض سيناريو آخر',f'''
<p>اختر سيناريو إضافيًا فقط إذا توفر وقت؛ كل أمر يشغّل ثلاث مرات ويحفظ مجلدًا جديدًا. لا تشغلها بالتوازي أثناء العرض.</p>
{code('''# Product details: live stock plus metadata cache and ETag
bash perf/interview_run.sh product-detail

# Product list: pagination and conditional GET
bash perf/interview_run.sh products-list

# Customer order history: indexes and stable ordering
bash perf/interview_run.sh customer-orders''')}
<p>في تفاصيل المنتج، قارن <bdi>data_received</bdi> و<bdi>conditional_hits</bdi> أيضًا. استجابة 304 تعني أن الجسم لم يُرسل مجددًا، وليس أن PHP أو gRPC لم يُنفذا. جميع الطلبات في هذه السيناريوهات قرائية بعد تسجيل الدخول.</p>
<p class="muted">للمنتجات تُختار صفحات وتصنيفات ومعرّفات ببذرة ثابتة. بعض صفحات المنتجات قد تكون فارغة في هذا الكتالوج الصغير؛ هذا من حدود الحمل المستخدم، فلا تصفه بأنه تغطية شاملة لكتالوج كبير. latest measured after stage ليس بالضرورة نفسه لجميع السيناريوهات.</p>'''))
content.append(section('questions','09 · أسئلة متوقعة وإجابات قصيرة','''
<details open><summary>لماذا ثلاث مرات؟ ولماذا p95 بدل المتوسط فقط؟</summary><p>لأن تشغيلًا واحدًا يتأثر بتذبذب الجهاز. نعرض الوسيط عبر ثلاث تشغيلات، وp95 يوضح الطلبات الأبطأ التي يخفيها المتوسط. لا تكفي ثلاث تجارب قصيرة لإثبات دلالة إحصائية أو سعة إنتاجية.</p></details>
<details><summary>هل كنت تختبر كاش دافئًا أم باردًا؟</summary><p>هذا الحمل يكرر القراءة ولا يمسح Redis بين التشغيلات. قد يحتوي أول تشغيل على misses، ثم يصبح الكاش دافئًا. النتائج تصف هذا المزيج وغلبة القراءات الدافئة، وليست قياسًا معزولًا لـcold start. لا نستخدم cache:clear لتمثيل جميع التحسينات السابقة.</p></details>
<details><summary>هل 5 VUs تعني 5 طلبات في الثانية أو 5 أنوية؟</summary><p>لا. VU مستخدم افتراضي ينفذ حلقة طلب وانتظار. معدل الطلبات ينتج عن عدد VUs والزمن وsleep. هذا سكربت يستخدم طلبات HTTP متزامنة لكل VU، وليس نموذج معدل وصول ثابتًا.</p></details>
<details><summary>لماذا لا نرفع الحمل كثيرًا أمام الدكتور؟</summary><p>للحفاظ على المقارنة مع الحمل المقاس على هذا اللابتوب. تغيير VUs أو المدة يجعلها تجربة أخرى، ويمكن أن يختبر حدود المعدل أو خادم التطوير بدل أثر التحسين نفسه. العناوين المحاكية توزع VUs كما في الأصل دون تغيير middleware.</p></details>
<details><summary>كيف نعرف أن السرعة لم تأتِ من بيانات ناقصة أو أخطاء؟</summary><p>المشغل يحفظ counts ويطبع نسبة endpoint_errors ويرفض المقارنة عند رصد أخطاء. نراجع كذلك الملفات والاختبارات. نفس الأعداد وحدها لا تثبت تطابق محتوى القاعدتين؛ للحالة التاريخية احتفظنا بالبيانات نفسها أثناء جميع مراحل القياس.</p></details>
<details><summary>هل الكاش يجعل النتائج خاطئة؟</summary><p>قديمة مؤقتًا ضمن TTL، لذلك فصلنا مفاتيح العملاء وأبطلناها عند الكتابة. لا نخزن stock. TTL الداشبورد 60 ثانية، والتصنيف 300 ثانية. هذه مقايضة موثقة، وليست اتساقًا لحظيًا لكل عميل في كل حقل.</p></details>
<details><summary>لماذا ليس هناك read replica أو nginx؟</summary><p>راجعنا القياسات ثم اخترنا تأجيل replica وتقليل خدمات اللابتوب، والإبقاء على خادم التطوير وإجماليات الصفحات. هذه قرارات النطاق الحالي، ولا تعني أن artisan serve مناسب للإنتاج.</p></details>
<details><summary>ماذا لو كانت النتيجة الحية أبطأ؟</summary><p>أعرض النتيجة كما هي. أفحص الأخطاء والحمل الآخر وحالة الخدمات ودفء الكاش واختلاف البيانات. لا أكرر حتى أحصل على الرقم الذي يعجبني ولا أسمّي ملفًا من النسخة المحسنة «قبل».</p></details>
<details><summary>هل k6 يثبت أن واجهة المستخدم صحيحة؟</summary><p>لا. هذا السكربت يختبر HTTP وحالة الاستجابة، وليس رسم React أو مسار المتصفح الكامل. لدينا اختبارات PHP وMySQL ومكوّنات وAPI مستقلة؛ اختبار Brave الكامل لم ينفذ بسبب منع التحكم عن بُعد.</p></details>'''))
content.append(section('fixes','10 · إذا تعطل العرض',f'''
<div class="tablewrap"><table><thead><tr><th>المشكلة</th><th>ما تفعله</th></tr></thead><tbody><tr><th>docker: command not found</th><td>تأكد أنك داخل Ubuntu/WSL. لا تبدل إلى Docker Desktop؛ المشروع مضبوط على Docker الأصلي في Linux.</td></tr><tr><th>permission denied / docker.sock</th><td>تأكد من عضوية المستخدم في مجموعة docker وأعد فتح جلسة Ubuntu بعد تطبيق الإعداد الأصلي. لا تستخدم chmod 666 للمقبس.</td></tr><tr><th>401 أو Setup login failed</th><td>تحقق من وجود حساب bulk التجريبي الذي يستخدمه common.js. لا تعِد seed تلقائيًا ولا تعمل migrate:fresh.</td></tr><tr><th>429</th><td>هذا حد الطلبات، لا استجابة ناجحة. انتظر تجدد النافذة وأوقف الاختبارات المتوازية؛ لا تعطل middleware لتبدو النتائج أسرع.</td></tr><tr><th>503 في تفاصيل المنتج</th><td>افحص inventory-service وقاعدة مخزونه. عرض خطأ هنا صحيح عند تعذر خدمة المخزون، وليس مبررًا لتخزين stock.</td></tr><tr><th>Network أو image غير موجود</th><td>نفّذ تجهيز الخطوة 02. تحتاج الصورة المحلية نفسها وشبكة compose؛ لا تسحب إصدارًا جديدًا عشوائيًا قبل المقارنة.</td></tr><tr><th>Connection refused بعد غلق Linux</th><td>أعد فتح Ubuntu وتشغيل الخدمات، وأبقِ الجلسة مفتوحة؛ WSL قد يتوقف بعد آخر جلسة.</td></tr></tbody></table></div>
{code('''docker compose ps
docker compose logs --tail=60 backend inventory-service redis''')}
<p>إذا فشل العرض الحي، أظهر الملفات الأصلية واشرح الخطأ بصراحة. لا تدّعِ أن المخرجات القديمة ناتجة من تشغيل نجح الآن.</p>'''))
content.append(section('source','11 · ملف k6 الذي تستطيع شرحه سطرًا بسطر',f'''
<p><bdi>dashboard.js</bdi> يختار السيناريو، و<bdi>common.js</bdi> يضبط الحمل وتسجيل الدخول والقياسات. القيم p95&lt;500 وerror&lt;1% أهداف موجودة في الكود لكنها غير مفعلة في التشغيل المقارن بسبب --no-thresholds.</p>
{code((ROOT/'perf/k6/dashboard.js').read_text(),'JavaScript · perf/k6/dashboard.js')}
<details><summary>عرض perf/k6/common.js كاملًا</summary>{code((ROOT/'perf/k6/common.js').read_text(),'JavaScript · السكربت المشترك')}</details>
<details><summary>عرض مشغّل المقابلة perf/interview_run.sh</summary>{code((ROOT/'perf/interview_run.sh').read_text(),'Bash · ثلاث تشغيلات دون تغيير التطبيق')}</details>
<details><summary>عرض أداة حساب المقارنة perf/interview_compare.py</summary>{code((ROOT/'perf/interview_compare.py').read_text(),'Python · قراءة JSON وحساب الوسيط')}</details>'''))
content.append(section('checklist','12 · ورقة تذكير قبل بدء المقابلة','''
<ul class="checklist"><li>أفتح Ubuntu داخل VS Code وأتأكد أن الخدمات سليمة.</li><li>أقول إن BEFORE أرشيف أصلي وإن التشغيل الحي يقيس AFTER الحالي.</li><li>أشرح الحمل: 5 VUs تدريجيًا، 30 ثانية، sleep ثانية، وثلاث تشغيلات.</li><li>أنفذ bash perf/interview_run.sh dashboard وأراقب الأخطاء.</li><li>أقرأ endpoint_duration p95 وp99 ونسبة الأخطاء، ثم الوسيط والمصادر.</li><li>أشرح الكود: تجميع استعلام، Cache::remember، TTL وإبطال الكاش، وRedis مشترك.</li><li>أوضح أن لا stock في الكاش وأن ETag يوفر نقل البيانات.</li><li>أذكر حدود التجربة، ولا أعرض RPS بوصفه السعة القصوى.</li></ul>
<div class="say"><strong>خاتمة مناسبة:</strong><p>«حافظت على صحة الطلبات وشكل API، ثم قست التغييرات تدريجيًا. التحسن موثق لهذا الحمل، وأي أرقام جديدة أعرضها كما هي. وإذا تغير الحمل أو الجهاز أو البيانات أتعامل معها كتجربة أخرى.»</p></div>
<p class="muted">مصادر المشروع: <a href="REPORT.md">REPORT.md</a> · <a href="docs/performance/results/summary.json">ملخص النتائج</a> · <a href="docs/performance/baseline/k6-dashboard-1.json">مثال JSON قبل</a> · <a href="docs/performance/results/after-refactor/k6-dashboard-1.json">مثال JSON بعد</a>.</p>
<p class="muted">مراجع تعريف المقاييس: <a href="https://grafana.com/docs/k6/latest/using-k6/metrics/reference/">مقاييس k6 الرسمية</a> · <a href="https://grafana.com/docs/k6/latest/using-k6/thresholds/">أهداف النجاح والفشل في k6</a>. كل أرقام المشروع مأخوذة من أدلته، وليست من أمثلة هذه المراجع.</p>'''))

css='''*{box-sizing:border-box}:root{--ink:#152c35;--muted:#526771;--accent:#096b6a;--line:#d8e3e6}html{scroll-behavior:smooth;scroll-padding-top:20px}body{margin:0;background:#f2f5f5;color:var(--ink);font:16px/1.95 Tahoma,"Segoe UI",Arial,sans-serif}a{color:var(--accent)}.wrap{max-width:1160px;margin:auto;padding:28px}.hero{background:#122f3a;color:#f2f8f7;padding:40px;border-radius:18px}.hero h1{font-size:clamp(29px,4vw,44px);margin:12px 0;line-height:1.4}.hero p{max-width:870px;color:#cedfe1}.label{color:#a8d8ce;font-size:12px;letter-spacing:.1em}.badge{display:inline-block;padding:4px 12px;border:1px solid #4b747b;border-radius:20px;font-size:12px;color:#e2efea}.tools{display:flex;gap:10px;margin:18px 0}.tools button{background:white;border:1px solid var(--line);padding:10px 16px;color:var(--accent);border-radius:8px;font:inherit;font-size:12px;cursor:pointer}.nav{display:flex;gap:8px;flex-wrap:wrap;margin:24px 0}.nav a{font-size:12px;text-decoration:none;background:#fff;border:1px solid var(--line);border-radius:20px;padding:5px 13px}section{background:#fff;padding:28px 32px;border:1px solid var(--line);border-radius:13px;margin:22px 0}h2{font-size:23px;margin:0 0 16px}h3{font-size:18px}p{margin:13px 0}.muted{font-size:13px;color:var(--muted)}.notice{background:#fff7e8;border-right:4px solid #c48e2d;padding:15px 18px;margin:18px 0;font-size:14px}.say{background:#eaf4ee;border-right:4px solid #4b9274;padding:15px 18px;margin:20px 0;font-size:14px}.say strong{color:#24654d}.say p{margin:7px 0}.code{direction:ltr;text-align:left;unicode-bidi:isolate;border:1px solid #29414d;border-radius:9px;overflow:hidden;margin:18px 0}.bar{background:#264350;color:#d8e9e7;padding:7px 13px;direction:rtl;display:flex;justify-content:space-between;gap:12px;font-size:11px}.copy{background:transparent;border:1px solid #6d939a;color:#fff;border-radius:5px;padding:3px 12px;cursor:pointer;font:inherit}.code pre{margin:0;padding:19px;background:#132b37;color:#e2eeeb;font:13px/1.8 Consolas,"Courier New",monospace;white-space:pre;overflow:auto;max-height:570px;tab-size:4}code.inline{direction:ltr;unicode-bidi:isolate;background:#eef3f4;border-radius:4px;font-size:14px}.tablewrap{overflow:auto;border:1px solid var(--line);border-radius:8px;margin:18px 0}table{width:100%;border-collapse:collapse;font-size:13px}td,th{padding:12px 13px;border-bottom:1px solid var(--line);text-align:right;vertical-align:top}thead{background:#edf4f4}tbody th{font-weight:normal}caption{text-align:right;padding:12px;font-size:12px;color:var(--muted)}.flow{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.flow div{padding:16px;background:#eff5f5;border:1px solid var(--line);border-radius:8px;font-size:13px}.flow strong{display:block;color:var(--accent)}details{padding:12px 0;border-bottom:1px solid var(--line)}summary{cursor:pointer;color:var(--accent);font-size:14px}.checklist li{margin:10px 0}button:focus-visible,a:focus-visible,summary:focus-visible{outline:3px solid #c48e2d;outline-offset:3px}footer{color:var(--muted);font-size:12px;padding:15px 5px}.quick{background:#e6efef;border:1px solid #cbdcde;padding:24px;border-radius:12px;margin-top:22px}.quick h2{font-size:20px}.quick .code{margin-bottom:0}@media(max-width:650px){.wrap{padding:12px}.hero{padding:28px 22px}section{padding:23px 18px}h2{font-size:20px}.flow{grid-template-columns:1fr}.code pre{font-size:11px}.tools button{flex:1;padding:8px}.quick{padding:18px}}@media print{body{background:white;font-size:11px}.wrap{max-width:none;padding:0}.hero{background:white;color:black;padding:15px;border:1px solid #bbb}.hero p,.label,.badge{color:black}.tools,.nav,.copy{display:none}section{padding:16px;border:1px solid #ccc;break-inside:auto}.code pre{background:#f1f3f3;color:black;max-height:none;white-space:pre-wrap;overflow-wrap:anywhere;font-size:8px}.bar{background:#eee;color:black}.tablewrap{overflow:visible}h2,summary{break-after:avoid}.hero h1{font-size:28px}a{color:inherit}.quick{padding:14px}details:not([open]){display:none}}'''
js='''document.querySelectorAll('.copy').forEach(b=>b.addEventListener('click',async()=>{const text=b.closest('.code').querySelector('code').textContent;try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text)}else{const t=document.createElement('textarea');t.value=text;t.style.position='fixed';t.style.opacity='0';document.body.append(t);t.select();const ok=document.execCommand('copy');t.remove();if(!ok)throw Error('copy')}b.textContent='تم النسخ'}catch{b.textContent='انسخ يدويًا'}setTimeout(()=>b.textContent='نسخ',2000)}));document.getElementById('print').onclick=()=>window.print();document.getElementById('open').onclick=()=>document.querySelectorAll('details').forEach(d=>d.open=true);document.getElementById('close').onclick=()=>document.querySelectorAll('details').forEach(d=>d.open=false);let state=[];window.addEventListener('beforeprint',()=>{state=[...document.querySelectorAll('details')].map(d=>[d,d.open]);state.forEach(([d])=>d.open=true)});window.addEventListener('afterprint',()=>state.forEach(([d,o])=>d.open=o));'''
nav=''.join(f'<a href="#{sid}">{label}</a>' for sid,label in [('honesty','قبل وبعد'),('terminal','تجهيز الطرفية'),('run','الأمر الحي'),('metrics','قراءة k6'),('numbers','الأرقام'),('changes','شرح الكود'),('sql','EXPLAIN'),('others','سيناريوهات إضافية'),('questions','أسئلة الدكتور'),('fixes','حل الأخطاء'),('source','مصدر السكربت'),('checklist','ورقة التذكير')])
html=f'''<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>دليل المقابلة — تشغيل k6 وشرح قبل وبعد</title><meta name="description" content="خطة عرض عملية بالعربية لتشغيل k6 وشرح قياسات المشروع والكود قبل وبعد التحسينات"><style>{css}</style></head><body><main class="wrap"><header class="hero"><div class="label" dir="ltr">INTERVIEW PLAYBOOK · K6</div><h1>شغّل الاختبار.<br>اشرح الفرق بالدليل.</h1><p>دليل المقابلة لمشروع internet-applications: ماذا تنفّذ في الطرفية، ماذا تقرأ من النتائج، وماذا تقول للدكتور عن التغييرات وحدود القياس.</p><span class="badge">عرض API حي + أدلة قبل/بعد محفوظة</span> <span class="badge">Ubuntu / WSL · Docker · k6</span></header><div class="tools"><button id="print" type="button">طباعة / PDF</button><button id="open" type="button">فتح الشروح والكود</button><button id="close" type="button">طي التفاصيل</button></div><div class="quick"><h2>الأمر الرئيسي — بعد تجهيز الخدمات</h2>{code('cd /mnt/e/projects/internet-applications\nbash perf/interview_run.sh dashboard')}<p class="muted">اقرأ قسم «قبل وبعد» أولًا حتى تميّز القياس الحي من الأرشيف.</p></div><nav class="nav" aria-label="فهرس المقابلة">{nav}</nav>{''.join(content)}<footer>هذا المستند يعمل دون إنترنت؛ الأكواد مضمنة. الروابط المحلية تحتاج بقاءه في جذر المشروع. أرقام التاريخ من نتائج 7 نوفمبر 2026، وأي تشغيل جديد يحفظ أدلته منفصلة. لإنشاء الملف مجددًا: python perf/generate_interview_guide.py.</footer></main><script>{js}</script></body></html>'''
OUT.write_text(html,encoding='utf-8')
print(json.dumps({'file':str(OUT),'bytes':OUT.stat().st_size},ensure_ascii=True))
