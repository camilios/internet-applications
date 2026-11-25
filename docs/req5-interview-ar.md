# مقابلة المتطلب الخامس: ثلاث نسخ، توقف تحت الضغط، وثلاثة عمّال

هذا السيناريو يستخدم مشروع Docker المعزول `ecommerce-req5`. لا تغيّر حاويات المتطلب الرابع. افتح نافذة WSL من المشروع في العرض؛ على Windows مع Docker Desktop يمكنك تنفيذ أوامر Docker نفسها من PowerShell واستبدال `python3` بـ`py -3`.

**إذا كانت البيئة مجهزة وشغالة:** نفّذ `python3 ops/req5/interview.py`، ثم افتح [صندوق المقابلة](http://127.0.0.1:8025). التقرير الناتج هو `docs/req5-interview-evidence.json`. الاختبار القديم `verify.py` يختبر التوقف **بعد** دفعة منفصلة ويستعمل بريداً وهمياً؛ ليس هو إثبات السيناريو الجديد. لا تستعمله أثناء تشغيل عمال SMTP بهذا الإعداد.

## التجهيز من الصفر قبل المقابلة

يحتاج جهاز زميلك إلى Docker مع Compose، وPython 3، وملف البيئة وملفات أسرار MySQL كما في [دليل إعداد جهاز آخر](after-pull-setup.md). لا تحتاجون Resend أو تشغيل الواجهة لعرض هذا السيناريو. من جذر المشروع نفّذ أوامر البناء والتشغيل أدناه، وعدّل مسار المشروع في السطر الأول ليناسب الجهاز.

```bash
cd /mnt/e/Projects/internet-applications
docker compose -f docker-compose.req5.yml -f docker-compose.req5-interview.yml build migrate inventory-service
docker compose -f docker-compose.req5.yml -f docker-compose.req5-interview.yml up -d --no-build --wait
docker compose -f docker-compose.req5.yml -f docker-compose.req5-interview.yml ps -a
python3 ops/req5/interview.py
```

إذا كانت حاويات المقابلة **موجودة** من تحضير سابق، يمكن تشغيلها كما هي دون إعادة بنائها أو تبديل صور وقاعدة بيانات الوسيط:

```bash
docker compose -f docker-compose.req5.yml -f docker-compose.req5-interview.yml start mysql inventory-mysql redis rabbitmq inventory-service api gateway reverb broadcast-worker scheduler outbox-publisher mailpit email-worker
docker compose -f docker-compose.req5.yml -f docker-compose.req5-interview.yml ps -a
```

انتظر حتى تصبح نسخ API سليمة، واترك نافذة WSL مفتوحة. يجب أن تكون النسخ والعمال الثلاثة شغالة قبل بدء الاختبار. التقرير يتغير فقط عند النجاح؛ تأكد من تاريخ التشغيل ومعرّفه عند عرض النتيجة. كل تشغيل يضيف بيانات تجريبية جديدة، ولا يمسح الاختبارات السابقة.

## ١. رؤية التوزيع أمام الدكتور

في Postman أرسل عدة مرات `GET http://127.0.0.1:8015/up`، وانظر إلى `X-Req5-Upstream` في **Response Headers**. أو من WSL:

```bash
for i in $(seq 1 9); do curl -sS -o /dev/null -w 'HTTP %{http_code} ' -D - http://127.0.0.1:8015/up | grep -Ei '^(X-Req5-Upstream:|HTTP 200)'; done
docker inspect -f '{{.Name}} {{(index .NetworkSettings.Networks "ecommerce-req5_edge").IPAddress}}' ecommerce-req5-api-1 ecommerce-req5-api-2 ecommerce-req5-api-3
```

**ما تقوله:** «نسخ Laravel متماثلة، ومثال العرض طلب قراءة قصير يمكن لأي نسخة تنفيذه؛ لا توجد فائدة من تثبيت كل زبون على حاوية. الموزّع يتناوب بين النسخ بأوزان متساوية، فيما تبقى بيانات الزبون ومفاتيح الدخول مشتركة. هذا يوازن عدد الطلبات لا زمن تنفيذها؛ لو كانت الطلبات طويلة ومتفاوتة الكلفة لقارنت ذلك عملياً باستراتيجية أقل عدد اتصالات. الترويسة تبين آخر عنوان أجاب حتى لو حاول Nginx عنواناً آخر أولاً».

## ٢. إيقاف أي نسخة وإعادتها بالاسم

كل زوج من الأوامر مستقل. أثناء الإيقاف كرر طلب Postman على **العنوان نفسه**. أعد كل نسخة وانتظر مشاركتها قبل تجربة التالية؛ لا توقف الثلاث دفعة واحدة.

```bash
docker stop ecommerce-req5-api-1
docker start ecommerce-req5-api-1
```
```bash
docker stop ecommerce-req5-api-2
docker start ecommerce-req5-api-2
```
```bash
docker stop ecommerce-req5-api-3
docker start ecommerce-req5-api-3
```

لإثبات **أثناء** الحمل، ابدأ والنسخ الثلاث سليمة ثم شغّل `python3 ops/req5/interview.py`. لا توقف نسخة أخرى بيدك أثناء تشغيله. الاختبار يرسل ٥٠٠ طلب إلى البوابة بـ١٢ عميلاً، ويطلق أمر الإيقاف عند الاستجابة المئة بينما يستمر الطلب. يطبع التوزيع قبل أمر الإيقاف وأثناءه وبعد تأكيد Docker، ويحسب أخطاء HTTP والشبكة دون إعادة محاولة من العميل. يقبل حتى خطأين من ٥٠٠ (٠٫٤٪)، ولا يعلن النجاح إلا إذا خدمت النسختان الناجيتان أثناء التوقف وعادت الثالثة بعده. هذا فحص توافر للقراءة على مضيف واحد، وليس ضمان تحمل فقدان المضيف أو قاعدة البيانات.

بعد اختبار الـ٥٠٠، يتحقق السكربت من عودة النسخة الأولى إلى التوزيع. ثم يوقف النسخة الثانية ويطلب قائمة التصنيفات ست مرات من البوابة ويعيد النسخة إلى التوزيع. يكرر ذلك للنسخة الثالثة. يمكنك عرض نتيجة كل عملية في `individual_stops_other_replicas` داخل [تقرير التشغيل](req5-interview-evidence.json).

## ٣. إثبات وصول رسائل البريد الفعلية مرة واحدة في هذه التجربة

الاختبار يجهز زبوناً ومنتجاً تجريبيين، ثم يشتري فعلياً من `POST /api/orders` عبر Nginx بمفاتيح شراء مستقلة. ينشر التطبيق الأحداث إلى RabbitMQ، وتقرأ الحاويات الثلاث من طابور `orders.email` نفسه. يستخدم العمال SMTP إلى **Mailpit**: صندوق مستقل محلي يمكن فتحه على `127.0.0.1:8025`، لا سجل وهمي داخل Laravel ولا بريد خارجي لزبائن حقيقيين. لا حاجة لمفتاح Resend. لا تخلط انتظار SMTP محلي مع إثبات وصول إلى Gmail.

```bash
docker compose -f docker-compose.req5.yml -f docker-compose.req5-interview.yml logs --since=5m email-worker | grep 'Order email processed'
```

افتح الصندوق وصفّه بعنوان `test_recipient` الوارد في التقرير. لكل طلب سطر في التقرير يحوي رقمه ومعرّف الحدث واسم العامل وعدد الرسائل المستلمة. الاسم في السجل يثبت المشاركة؛ **الصندوق** يثبت الاستلام. لا نعدّ الرسائل حسب Message-ID وحده حتى لا يخفي ذلك تكراراً. في النهاية يعاد نشر حدث سبق تسجيل تسليمه؛ ننتظر معالجته مرة ثانية ونفحص أن العدد في الصندوق لم يزد. هذا دليل على هذه الطلبات وعلى هذه الإعادة، وليس ضماناً رياضياً عند كل انهيار ممكن بين قبول SMTP وتثبيت معاملة MySQL.

للمراجعة: [إعداد Nginx](../ops/req5/nginx.conf)، [إعداد عمال SMTP والصندوق](../docker-compose.req5-interview.yml)، [الاختبار](../ops/req5/interview.py).
