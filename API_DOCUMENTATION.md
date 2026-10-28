# دليل واجهات برمجة التطبيقات الشامل (API Documentation)
### موجه لمطوري الواجهة الأمامية (Frontend Developers)

---

## الفهرس العام
1. [مقدمة وإرشادات عامة](#1-مقدمة-وإرشادات-عامة)
2. [نظام المصادقة وإدارة الجلسات (Authentication)](#2-نظام-المصادقة-وإدارة-الجلسات-authentication)
   - [إنشاء حساب جديد (Register)](#-إنشاء-حساب-جديد-post-apiregister)
   - [تسجيل الدخول (Login)](#-تسجيل-الدخول-post-apilogin)
   - [تسجيل الخروج (Logout)](#-تسجيل-الخروج-post-apilogout)
   - [بيانات المستخدم الحالي (Me / Profile)](#-بيانات-المستخدم-الحالي-get-apime)
3. [إدارة وتصفح التصنيفات (Categories)](#3-إدارة-وتصفح-التصنيفات-categories)
   - [عرض قائمة التصنيفات](#-قائمة-التصنيفات-get-apicategories)
   - [عرض تفاصيل تصنيف](#-تفاصيل-تصنيف-محدد-get-apicategoriescategory)
   - [إضافة تصنيف جديد (Admin)](#-إضافة-تصنيف-جديد-post-apicategories-admin)
   - [تعديل تصنيف (Admin)](#-تعديل-تصنيف-put-apicategoriescategory-admin)
   - [حذف تصنيف (Admin)](#-حذف-تصنيف-delete-apicategoriescategory-admin)
4. [الكتالوج واستعراض المنتجات والمخزون (Products)](#4-الكتالوج-واستعراض-المنتجات-والمخزون-products)
   - [استعراض المنتجات وفلترتها](#-استعراض-المنتجات-وفلترتها-get-apiproducts)
   - [تفاصيل المنتج والمخزون اللحظي](#-تفاصيل-المنتج-مع-المخزون-اللحظي-get-apiproductsproduct)
   - [إضافة منتج جديد (Admin)](#-إضافة-منتج-جديد-post-apiproducts-admin)
   - [تعديل منتج (Admin)](#-تعديل-منتج-put-apiproductsproduct-admin)
   - [تعطيل/حذف منتج (Admin)](#-تعطيل-منتج-delete-apiproductsproduct-admin)
5. [نظام الطلبات وحجز المخزون (Orders)](#5-نظام-الطلبات-وحجز-المخزون-orders)
   - [إنشاء طلب جديد (مع منع التكرار Idempotency)](#-إنشاء-طلب-جديد-post-apiorders)
   - [استعراض طلبات المستخدم](#-استعراض-طلبات-المستخدم-get-apiorders)
   - [تفاصيل طلب محدد](#-تفاصيل-طلب-محدد-get-apiordersorder)
   - [استعراض كافة الطلبات (Admin)](#-استعراض-كافة-الطلبات-get-apiadminorders-admin)
   - [تحديث حالة الطلب وتغيير المخزون (Admin)](#-تحديث-حالة-الطلب-patch-apiadminordersorderstatus-admin)
6. [نظام الإشعارات (Notifications)](#6-نظام-الإشعارات-notifications)
   - [استعراض إشعارات المستخدم](#-استعراض-إشعارات-المستخدم-get-apinotifications)
   - [تحديد كافة الإشعارات كمقروءة](#-تحديد-كافة-الإشعارات-كمقروءة-patch-apinotificationsread-all)
   - [تحديد إشعار محدد كمقروء](#-تحديد-إشعار-محدد-كمقروء-patch-apinotificationsnotificationread)
7. [معالجة الأخطاء وأكواد الاستجابة (Error Handling)](#7-معالجة-الأخطاء-وأكواد-الاستجابة-error-handling)

---

## 1. مقدمة وإرشادات عامة

### العناوين الرئيسية للخدمة (Base URLs)
- **بيئة Docker المحلية**: `http://localhost:8000/api`
- **عبر الوكيل العكسي أو Vite Proxy**: `/api`

### الترويسات العامة المطلوبة (General Headers)
يجب إرسال الترويسات التالية مع كافة طلبات JSON:
```http
Accept: application/json
Content-Type: application/json
```
وفي حال كانت الواجهة تتطلب مصادقة:
```http
Authorization: Bearer <access_token>
```

### بنية استجابات القوائم والترقيم (Pagination Structure)
جميع استجابات القوائم المرقّمة (Paginated Responses) تأتي بالهيكل الموحّد التالي:
```json
{
  "data": [ /* مصفوفة العناصر */ ],
  "links": {
    "first": "http://localhost:8000/api/...?page=1",
    "last": "http://localhost:8000/api/...?page=5",
    "prev": null,
    "next": "http://localhost:8000/api/...?page=2"
  },
  "meta": {
    "current_page": 1,
    "from": 1,
    "last_page": 5,
    "per_page": 15,
    "to": 15,
    "total": 72
  }
}
```

---

## 2. نظام المصادقة وإدارة الجلسات (Authentication)

يستخدم النظام مصادقة مبنية على **JWT (JSON Web Tokens)** عبر مكتبة `tymon/jwt-auth`. صلاحية الرمز تستمر لمدة **60 دقيقة** (3600 ثانية).

---

### 🔹 إنشاء حساب جديد: `POST /api/register`
- **الوظيفة**: تسجيل عميل جديد في المتجر وإنشاء حسابه، مع تسجيل دخوله فورًا وإرجاع رمز الوصول JWT.
- **الصلاحية المطلوبة**: عام (Public).
- **معدل الطلبات المسموح**: 10 طلبات في الدقيقة كحد أقصى (Throttle: 10,1).
- **ملاحظة أمنية هامة**: يتم تعيين دور المستخدم تلقائيًا كـ `customer`. لا يقبل الباك إند حقل `role` من العميل إطلاقًا لمنع تصعيد الصلاحيات.

#### جسم الطلب (Request Body):
```json
{
  "name": "أحمد محمود",
  "email": "ahmed@example.com",
  "password": "Password123!",
  "password_confirmation": "Password123!"
}
```
| الحقل | النوع | القيود | الوصف |
|---|---|---|---|
| `name` | string | إجباري، أقصى طول 255 | اسم المستخدم الكامل |
| `email` | string (email) | إجباري، فريد في جدول المستخدمين | البريد الإلكتروني |
| `password` | string | إجباري، حد أدنى 8 أحرف | كلمة المرور |
| `password_confirmation` | string | إجباري | تأكيد كلمة المرور، ويجب أن يطابق `password` |

#### الاستجابة الناجحة (`201 Created`):
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600,
  "user": {
    "id": 1,
    "name": "أحمد محمود",
    "email": "ahmed@example.com",
    "role": "customer",
    "created_at": "2026-10-28T10:00:00.000000Z"
  }
}
```

#### الاستجابات الخاطئة المحتملة:
- `422 Unprocessable Content`: كلمة المرور أقل من 8 خانات، أو البريد مستخدم مسبقًا، أو كلمتا المرور غير متطابقتين.
- `429 Too Many Requests`: تجاوز الحد المسموح (10 طلبات في الدقيقة).

---

### 🔹 تسجيل الدخول: `POST /api/login`
- **الوظيفة**: التحقق من البريد الإلكتروني وكلمة المرور، وإرجاع رمز JWT الجديد وبيانات المستخدم.
- **الصلاحية المطلوبة**: عام (Public).
- **معدل الطلبات**: 10 طلبات في الدقيقة (Throttle: 10,1).

#### جسم الطلب (Request Body):
```json
{
  "email": "ahmed@example.com",
  "password": "Password123!"
}
```

#### الاستجابة الناجحة (`200 OK`):
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600,
  "user": {
    "id": 1,
    "name": "أحمد محمود",
    "email": "ahmed@example.com",
    "role": "customer",
    "created_at": "2026-10-28T10:00:00.000000Z"
  }
}
```

#### الاستجابات الخاطئة:
- `401 Unauthorized`: البريد أو كلمة المرور غير صحيحة:
  ```json
  { "message": "Invalid credentials." }
  ```
- `422 Unprocessable Content`: عدم إرسال البريد أو كلمة المرور.

---

### 🔹 تسجيل الخروج: `POST /api/logout`
- **الوظيفة**: إبطال رمز الـ JWT الحالي (Token Blacklisting) بحيث لا يمكن استخدامه لاحقًا.
- **الصلاحية المطلوبة**: مسجل الدخول (`auth:api`).

#### الترويسات المطلوبة:
```http
Authorization: Bearer <access_token>
```

#### الاستجابة الناجحة (`200 OK`):
```json
{
  "message": "Logged out successfully."
}
```

---

### 🔹 بيانات المستخدم الحالي: `GET /api/me`
- **الوظيفة**: إرجاع الملف الشخصي لصاحب الرمز الحالي للتحقق من هوية المستخدم ودوره (`customer` أو `admin`).
- **الصلاحية المطلوبة**: مسجل الدخول (`auth:api`).

#### الاستجابة الناجحة (`200 OK`):
```json
{
  "data": {
    "id": 1,
    "name": "أحمد محمود",
    "email": "ahmed@example.com",
    "role": "customer",
    "created_at": "2026-10-28T10:00:00.000000Z"
  }
}
```

---

## 3. إدارة وتصفح التصنيفات (Categories)

---

### 🔹 قائمة التصنيفات: `GET /api/categories`
- **الوظيفة**: استعراض كافة التصنيفات المتاحة في المتجر مرتبة أبجديًا حسب الاسم، ومقسمة لصفحات (30 تصنيف لكل صفحة).
- **الصلاحية المطلوبة**: عام (Public).

#### معاملات الاستعلام (Query Parameters):
| المعامل | النوع | الافتراضي | الوصف |
|---|---|---|---|
| `page` | integer | 1 | رقم الصفحة المراد جلبها |

#### الاستجابة الناجحة (`200 OK`):
```json
{
  "data": [
    {
      "id": 1,
      "name": "هواتف ذكية",
      "description": "أحدث أجهزة الهواتف الذكية والإلكترونيات المحمولة",
      "created_at": "2026-10-28T10:00:00.000000Z",
      "updated_at": "2026-10-28T10:00:00.000000Z"
    }
  ],
  "links": { /* pagination links */ },
  "meta": { /* pagination metadata */ }
}
```

---

### 🔹 تفاصيل تصنيف محدد: `GET /api/categories/{category}`
- **الوظيفة**: جلب بيانات تصنيف واحد بواسطة معرّفه الرقمي (ID).
- **الصلاحية المطلوبة**: عام (Public).

#### معاملات المسار (Path Parameters):
- `category` (integer, required): معرّف التصنيف في قاعدة البيانات (مثل `1`).

#### الاستجابة الناجحة (`200 OK`):
```json
{
  "data": {
    "id": 1,
    "name": "هواتف ذكية",
    "description": "أحدث أجهزة الهواتف الذكية والإلكترونيات المحمولة",
    "created_at": "2026-10-28T10:00:00.000000Z",
    "updated_at": "2026-10-28T10:00:00.000000Z"
  }
}
```

---

### 🔹 إضافة تصنيف جديد: `POST /api/categories` (Admin)
- **الوظيفة**: إنشاء تصنيف جديد في النظام.
- **الصلاحية المطلوبة**: مشرف فقط (`auth:api` مع `role: admin`).

#### جسم الطلب:
```json
{
  "name": "أجهزة لوحية",
  "description": "أجهزة التابلت والآيباد وإكسسواراتها"
}
```
| الحقل | النوع | القيود | الوصف |
|---|---|---|---|
| `name` | string | إجباري، أقصى طول 255 | اسم التصنيف |
| `description` | string | اختياري (nullable) | وصف تفصيلي للتصنيف |

#### الاستجابة الناجحة (`201 Created`):
تُرجع كائن التصنيف المُنشأ حديثًا.

---

### 🔹 تعديل تصنيف: `PUT /api/categories/{category}` (Admin)
- **الوظيفة**: تحديث بيانات تصنيف موجود.
- **الصلاحية المطلوبة**: مشرف فقط (`role: admin`).

#### جسم الطلب:
نفس حقول إنشاء التصنيف (`name`, `description`).

#### الاستجابة الناجحة (`200 OK`):
تُرجع بيانات التصنيف بعد التحديث.

---

### 🔹 حذف تصنيف: `DELETE /api/categories/{category}` (Admin)
- **الوظيفة**: حذف التصنيف من النظام.
- **الصلاحية المطلوبة**: مشرف فقط (`role: admin`).
- **قاعدة عمل هامة جداً (Business Rule)**: إذا كان التصنيف يحتوي على منتجات مرتبطة به (سواء نشطة أو محذوفة Soft-deleted)، يرفض النظام الحذف فوراً لحماية ترابط البيانات ويعيد خطأ `409 Conflict`.

#### الاستجابة في حال النجاح (`200 OK`):
```json
{ "message": "Category deleted." }
```

#### الاستجابة في حال احتواء التصنيف على منتجات (`409 Conflict`):
```json
{ "message": "Categories containing products cannot be deleted." }
```

---

## 4. الكتالوج واستعراض المنتجات والمخزون (Products)

---

### 🔹 استعراض المنتجات وفلترتها: `GET /api/products`
- **الوظيفة**: تصفح المنتجات النشطة (`is_active = true`) في المتجر. لا يتم عرض المنتجات المعطلة للعملاء.
- **الصلاحية المطلوبة**: عام (Public).

#### معاملات الاستعلام (Query Parameters):
| المعامل | النوع | الافتراضي | الوصف |
|---|---|---|---|
| `search` | string | فارغ | تصفية حسب اسم المنتج (مطابقة جزئية `LIKE %term%`) |
| `category_id` | integer | فارغ | فلترة المنتجات التابعة لتصنيف معين |
| `per_page` | integer | 15 | عدد المنتجات في الصفحة (الأدنى 1، الأقصى 100) |
| `page` | integer | 1 | رقم الصفحة |

#### الاستجابة الناجحة (`200 OK`):
```json
{
  "data": [
    {
      "id": 1001,
      "name": "آيفون 15 برو",
      "description": "هاتف بتصميم من التيتانيوم وشريحة A17 Pro",
      "price": "999.00",
      "image_url": "http://localhost:8000/storage/products/iphone15.jpg",
      "category": {
        "id": 1,
        "name": "هواتف ذكية",
        "description": "أحدث أجهزة الهواتف الذكية"
      },
      "is_active": true,
      "created_at": "2026-10-28T10:00:00.000000Z",
      "updated_at": "2026-10-28T10:00:00.000000Z"
    }
  ],
  "links": { /* ... */ },
  "meta": { /* ... */ }
}
```

---

### 🔹 تفاصيل المنتج مع المخزون اللحظي: `GET /api/products/{product}`
- **الوظيفة**: جلب البيانات الكاملة لمنتج محدد، بالإضافة إلى **المخزون الفعلي المتاح للبيع في تلك اللحظة**.
- **الصلاحية المطلوبة**: عام (Public).
- **كواليس العمل (Architecture & Behind the Scenes)**:
  1. يقوم الباك إند بالاستعلام عن المنتج في قاعدة بياناته.
  2. إذا كان المنتج غير نشط (`is_active = false`) والزائر ليس مشرفاً، يتم إرجاع `404 Not Found`.
  3. يقوم خادم Laravel بإجراء اتصال gRPC مباشر وفوري بخدمة المخزون المنفصلة `inventory-service` عبر دالة `GetStock(product_id)`.
  4. تُرجع خدمة المخزون الكمية المتاحة (Total - Reserved).
  5. يقوم الباك إند بحقن هذا الرقم في حقل `stock` في الاستجابة.

#### الاستجابة الناجحة (`200 OK`):
```json
{
  "data": {
    "id": 1001,
    "name": "آيفون 15 برو",
    "description": "هاتف بتصميم من التيتانيوم وشريحة A17 Pro",
    "price": "999.00",
    "image_url": "http://localhost:8000/storage/products/iphone15.jpg",
    "category": {
      "id": 1,
      "name": "هواتف ذكية"
    },
    "is_active": true,
    "stock": 48,
    "created_at": "2026-10-28T10:00:00.000000Z",
    "updated_at": "2026-10-28T10:00:00.000000Z"
  }
}
```

#### الاستجابات الاستثنائية:
- `404 Not Found`: المنتج غير موجود، أو معطل والزائر ليس مشرفاً.
- `503 Service Unavailable`: في حال انقطاع الاتصال بين خادم الـ API وخدمة المخزون `inventory-service`:
  ```json
  {
    "message": "Current inventory is unavailable. Please try again.",
    "code": "INVENTORY_UNAVAILABLE"
  }
  ```

---

### 🔹 إضافة منتج جديد: `POST /api/products` (Admin)
- **الوظيفة**: إضافة منتج جديد ورفع صورته وربطه بتصنيف محدد.
- **الصلاحية المطلوبة**: مشرف فقط (`role: admin`).
- **نوع المحتوى المفضل**: `multipart/form-data` (لدعم رفع الصور) أو `application/json`.

#### حقول الطلب:
| الحقل | النوع | القيود | الوصف |
|---|---|---|---|
| `name` | string | إجباري، أقصى طول 255 | اسم المنتج |
| `description` | string | اختياري | وصف المنتج |
| `price` | numeric | إجباري، الحد الأدنى 0.01 | سعر المنتج (تنسيق عشري) |
| `category_id` | integer | إجباري، يجب أن يوجد في `categories` | معرّف التصنيف |
| `image` | file / binary | اختياري، صيغ صور صالحة، أقصى حجم 2MB | صورة المنتج |
| `is_active` | boolean | اختياري، القيمة الافتراضية `true` | حالة التنشيط |

#### الاستجابة الناجحة (`201 Created`):
تُرجع بيانات المنتج المنشأ ورابط الصورة المولّد `image_url`.

---

### 🔹 تعديل منتج: `PUT /api/products/{product}` (Admin)
- **الوظيفة**: تعديل بيانات المنتج أو تحديث صورته.
- **الصلاحية المطلوبة**: مشرف فقط (`role: admin`).
- **الحقول**: جميع حقول الإضافة السابقة تكون اختيارية (`sometimes`) بحيث يمكن تعديل حقل واحد أو عدة حقول دون الحاجة لإرسال كل الحقول.

---

### 🔹 تعطيل منتج: `DELETE /api/products/{product}` (Admin)
- **الوظيفة**: يقوم بعمل Soft Delete للمنتج وإلغاء تنشيطه (`is_active = false`). المنتج لن يظهر للعملاء في المتجر، لكن تظل سجلاته التاريخية محفوظة للطلبات السابقة.
- **الصلاحية المطلوبة**: مشرف فقط (`role: admin`).

#### الاستجابة الناجحة (`200 OK`):
```json
{ "message": "Product deactivated." }
```

---

## 5. نظام الطلبات وحجز المخزون (Orders)

هذا هو الجزء المحوري والأكثر حساسية في التطبيق، حيث يعمل بنمط المعاملات الموزعة والتراجع الذاتي (Distributed Saga / Durable Compensation).

---

### 🔹 إنشاء طلب جديد: `POST /api/orders`
- **الوظيفة**: يقوم العميل بإنشاء طلب شراء يحتوي على قائمة المنتجات والكميات المطلوبة.

#### ⚠️ قواعد إلزامية وتفصيلية للفرونت إند:
1. **ترويسة `Idempotency-Key` إجبارية**:
   يجب توليد UUID v4 فريد لكل محاولة إنشاء طلب وإرساله في ترويسات الطلب:
   ```http
   Idempotency-Key: 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d
   ```
   **الفائدة**: لو انقطع الإنترنت بعد إرسال الطلب، وقام المستخدم بالضغط مجددًا، أو قام الكود بإعادة الإرسال تلقائيًا، فإن الباك إند يتعرف على نفس المفتاح ولا يقوم بخصم المخزون مرتين ولا ينشئ طلبين، بل يعيد الطلب الذي تم إنشاؤه بنجاح!
2. **الأسعار تُحسب على السيرفر فقط**:
   لا ترسل أسعار المنتجات أو إجمالي الطلب في جسم الطلب. يقرأ الباك إند السعر المعتمد والمحمي لكل منتج من قاعدة البيانات ويحسب الإجمالي بدقة فائقة باستخدام حسابات الفاصلة الثابتة `bcmath`.
3. **آلية حجز المخزون**:
   - يتحقق السيرفر من أن جميع المنتجات نشطة وموجودة.
   - يتصل بخدمة المخزون عبر gRPC لحجز الكميات ذريًا (`ReserveStock`).
   - في حال نجاح الحجز، يتم حفظ الطلب وبنوده في جدول الطلبات.
   - إذا فشل الحفظ في قاعدة البيانات بعد نجاح حجز المخزون، يُطلق النظام تلقائيًا عملية تعويضية (`ReleaseStock`) لتحرير الكميات وإلغاء الحجز فورًا لمنع ضياع المخزون.

#### جسم الطلب (Request Body):
```json
{
  "items": [
    {
      "product_id": 1001,
      "quantity": 1
    },
    {
      "product_id": 1002,
      "quantity": 2
    }
  ]
}
```

#### الاستجابة الناجحة (`201 Created`):
```json
{
  "data": {
    "id": 105,
    "user_id": 1,
    "total": "1998.00",
    "status": "pending",
    "items": [
      {
        "id": 1,
        "quantity": 1,
        "unit_price": "999.00",
        "subtotal": "999.00",
        "product": {
          "id": 1001,
          "name": "آيفون 15 برو",
          "price": "999.00"
        }
      },
      {
        "id": 2,
        "quantity": 2,
        "unit_price": "499.50",
        "subtotal": "999.00",
        "product": {
          "id": 1002,
          "name": "ساعة ذكية",
          "price": "499.50"
        }
      }
    ],
    "created_at": "2026-10-28T10:30:00.000000Z",
    "updated_at": "2026-10-28T10:30:00.000000Z"
  }
}
```

#### استجابات الأخطاء وحالات المعالجة للفرونت إند:
- `409 Conflict` (نقص المخزون):
  تعني أن كمية أحد المنتجات المطلوبة غير متوفرة في المخزون.
  ```json
  {
    "message": "Insufficient stock for product ID 1001.",
    "code": "INSUFFICIENT_STOCK"
  }
  ```
  *(الإجراء المطلوب في الفرونت إند: إشعار المستخدم بنفاد الكمية وتحديث سلة المشتريات)*.

- `503 Service Unavailable` مع كود `RESERVATION_OUTCOME_UNKNOWN`:
  تعني أن مهلة الاتصال انتهت أثناء تأكيد الحجز، ولم تتأكد النتيجة بعد:
  ```json
  {
    "message": "The reservation result is not yet known. Retry with the same Idempotency-Key.",
    "code": "RESERVATION_OUTCOME_UNKNOWN"
  }
  ```
  *(الإجراء المطلوب في الفرونت إند: إعادة محاولة إرسال نفس الطلب بعد ثانية أو ثانيتين **بنفس مفتاح `Idempotency-Key` ونفس البنود حصراً**)*.

- `422 Unprocessable Content`: عدم إرسال ترويسة الـ Idempotency-Key كـ UUID، أو مصفوفة البنود فارغة، أو منتج غير نشط.

---

### 🔹 استعراض طلبات المستخدم: `GET /api/orders`
- **الوظيفة**: جلب سجل طلبات العميل الحالي مرتبة من الأحدث إلى الأقدم، مع بنود كل طلب، ومقسمة لصفحات (15 طلب لكل صفحة).
- **الصلاحية المطلوبة**: مسجل الدخول (`auth:api`).

#### معاملات الاستعلام:
- `page` (integer): رقم الصفحة.

#### الاستجابة الناجحة (`200 OK`):
تُرجع قائمة الطلبات بالهيكل المرقّم القياسي.

---

### 🔹 تفاصيل طلب محدد: `GET /api/orders/{order}`
- **الوظيفة**: استعراض التفاصيل الكاملة لطلب معين وبنوده ومنتجاته.
- **الصلاحية والأمان**: مسموح **فقط** لصاحب الطلب أو للمشرف (`admin`) باستعراضه. إذا حاول مستخدم استعراض طلب مستخدم آخر، يُرجع الباك إند `404 Not Found` لحماية الخصوصية.

---

### 🔹 استعراض كافة الطلبات: `GET /api/admin/orders` (Admin)
- **الوظيفة**: لوحة الإدارة لمشاهدة جميع طلبات المتجر لجميع العملاء، متضمنة بيانات العميل صاحب الطلب.
- **الصلاحية المطلوبة**: مشرف فقط (`role: admin`).

---

### 🔹 تحديث حالة الطلب: `PATCH /api/admin/orders/{order}/status` (Admin)
- **الوظيفة**: تحديث حالة الطلب من قِبل المشرف، وتطبيق آليات إرجاع المخزون عند الإلغاء.
- **الصلاحية المطلوبة**: مشرف فقط (`role: admin`).

#### قواعد الانتقال الصارمة للحالات (State Machine):
يطبق الباك إند نظام انتقالات صارم يمنع التحولات العشوائية لحماية دورة حياة الطلب:
```
           ┌───────────► confirmed ───────────► processing ───────────► shipped ───────────► delivered
           │                 │                       │
pending ───┤                 │                       │
           │                 ▼                       ▼
           └───────────► cancelled               cancelled
```
- الحالات المسموحة:
  - من `pending` إلى: `confirmed` أو `cancelled`.
  - من `confirmed` إلى: `processing` أو `cancelled`.
  - من `processing` إلى: `shipped` أو `cancelled`.
  - من `shipped` إلى: `delivered` فقط.
  - الحالتان `delivered` و `cancelled` هما حالتان نهائيتان (Terminal States) ولا يمكن تغييرهما بعدها.

#### ⚠️ ماذا يحدث عند تحويل الطلب إلى `cancelled`؟
يقوم السيرفر فورًا باستدعاء خدمة المخزون لإلغاء الحجز (`ReleaseStock`) وإعادة كل كميات المنتجات إلى المخزون المتاح للبيع فورًا، ثم يرسل إشعارًا للعميل بإلغاء طلبه.

#### جسم الطلب:
```json
{
  "status": "processing"
}
```

#### الاستجابات الخاطئة:
- `409 Conflict`: عند محاولة إجراء تحول غير صالح (مثلاً محاولة تغيير طلب مسلّم `delivered` إلى `cancelled`):
  ```json
  { "message": "Cannot transition from 'delivered' to 'cancelled'." }
  ```
- `503 Service Unavailable`: في حال تم اختيار `cancelled` ولكن خدمة المخزون تعذر عليها تأكيد إلغاء الحجز في تلك اللحظة.

---

## 6. نظام الإشعارات (Notifications)

يقوم الباك إند بإنشاء إشعارات تلقائية للمستخدم عند إنشاء طلب جديد أو عند قيام الإدارة بتغيير حالة الطلب.

---

### 🔹 استعراض إشعارات المستخدم: `GET /api/notifications`
- **الوظيفة**: استعراض كافة إشعارات المستخدم الحالي (مقروءة وغير مقروءة)، مرتبة من الأحدث إلى الأقدم (15 إشعار بالصفحة).
- **الصلاحية المطلوبة**: مسجل الدخول (`auth:api`).

#### الاستجابة الناجحة (`200 OK`):
```json
{
  "data": [
    {
      "id": "c4b9d031-7bfa-4c8d-8a5e-859e4b600f12",
      "type": "App\\Notifications\\OrderNotification",
      "data": {
        "order_id": 105,
        "status": "confirmed",
        "total": "1998.00",
        "message": "Your order #105 status changed to confirmed."
      },
      "read_at": null,
      "created_at": "2026-10-28T10:35:00.000000Z"
    }
  ],
  "links": { /* ... */ },
  "meta": { /* ... */ }
}
```
*ملاحظة: إذا كان حقل `read_at` يحمل قيمة `null`، فهذا يعني أن الإشعار غير مقروء (Unread).*

---

### 🔹 تحديد كافة الإشعارات كمقروءة: `PATCH /api/notifications/read-all`
- **الوظيفة**: وضع الوقت الحالي في حقل `read_at` لكافة الإشعارات غير المقروءة الخاصة بالمستخدم الحالي دفعة واحدة (تستخدم عند الضغط على زر "تحديد الكل كمقروء").
- **الصلاحية المطلوبة**: مسجل الدخول (`auth:api`).

#### الاستجابة الناجحة (`200 OK`):
```json
{
  "message": "Notifications marked as read."
}
```

---

### 🔹 تحديد إشعار محدد كمقروء: `PATCH /api/notifications/{notification}/read`
- **الوظيفة**: تحديث حالة إشعار واحد محدد كمقروء عند ضغط المستخدم عليه.
- **الصلاحية المطلوبة**: مسجل الدخول (`auth:api`).

#### معاملات المسار:
- `notification` (string - UUID): المعرّف الفريد للإشعار (مثل: `c4b9d031-7bfa-4c8d-8a5e-859e4b600f12`).

#### الاستجابة الناجحة (`200 OK`):
```json
{
  "message": "Notification marked as read."
}
```

---

## 7. معالجة الأخطاء وأكواد الاستجابة (Error Handling)

تم توحيد أكواد ومعاني الأخطاء عبر كافة نقاط النهاية لتسهيل برمجتها في الفرونت إند:

| كود الحالة (HTTP Code) | متى يحدث؟ | كيفية المعالجة في الفرونت إند؟ |
|---|---|---|
| **`200 OK`** | نجاح العملية وجلب البيانات أو التعديل | معالجة البيانات وعرضها للمستخدم. |
| **`201 Created`** | نجاح إنشاء سجل جديد (تسجيل، فئة، منتج، طلب) | توجيه المستخدم أو تحديث القوائم. |
| **`401 Unauthorized`** | رمز JWT مفقود أو انتهت صلاحيته أو غير صالح | توجيه المستخدم لصفحة تسجيل الدخول ومسح الرمز المخزن. |
| **`403 Forbidden`** | المستخدم لا يملك صلاحية المشرف (`role !== admin`) | عرض رسالة "غير مسموح لك بالوصول لهذه الصفحة". |
| **`404 Not Found`** | العنصر المطلوب غير موجود أو غير تابع للمستخدم | عرض صفحة الخطأ 404 أو رسالة تنبيه. |
| **`409 Conflict`** | تعارض في منطق العمل (نقص مخزون، حذف تصنيف به منتجات، حالة طلب غير صالحة) | قراءة حقل `code` أو `message` وتنبيه المستخدم بالسبب المنطقي. |
| **`422 Unprocessable Content`** | فشل التحقق من صحة المدخلات (Validation Failure) | عرض رسائل الأخطاء الموجودة في كائن `errors` تحت حقول الإدخال المقابلة. |
| **`429 Too Many Requests`** | تجاوز عدد الطلبات في الدقيقة (في تسجيل الدخول والتسجيل) | تنبيه المستخدم بالانتظار دقيقة قبل المحاولة مجددًا. |
| **`503 Service Unavailable`** | خدمة المخزون غير متاحة، أو نتيجة الحجز غير مؤكدة | إذا كان الكود `RESERVATION_OUTCOME_UNKNOWN` يتم إعادة المحاولة بنفس الـ UUID، غير ذلك تنبيه المستخدم بوجود صيانة مؤقتة. |

---

## 8. أمثلة برمجية مساعدة لمطوري الواجهة الأمامية (Frontend Examples)

### مثال 1: إعداد Axios مع حقن رمز JWT تلقائيًا
```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000/api',
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  },
});

// حقن التوكن في كل طلب
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// التعامل مع انتهاء صلاحية الجلسة تلقائيًا
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
```

---

### مثال 2: دالة إنشاء طلب مع الـ Idempotency-Key وإعادة المحاولة الذكية
```javascript
import { v4 as uuidv4 } from 'uuid';
import api from './api';

export async function submitOrder(cartItems) {
  // توليد مفتاح فريد لهذه المحاولة
  const idempotencyKey = uuidv4();

  const payload = {
    items: cartItems.map(item => ({
      product_id: item.productId,
      quantity: item.quantity,
    })),
  };

  try {
    const response = await api.post('/orders', payload, {
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
    });
    return response.data.data; // الطلب المنشأ
  } catch (error) {
    // في حال عدم التأكد من النتيجة، نعيد المحاولة بنفس المفتاح
    if (error.response?.data?.code === 'RESERVATION_OUTCOME_UNKNOWN') {
      console.warn('Retrying with identical Idempotency-Key...');
      await new Promise(resolve => setTimeout(resolve, 1500));
      const retryResponse = await api.post('/orders', payload, {
        headers: { 'Idempotency-Key': idempotencyKey },
      });
      return retryResponse.data.data;
    }

    throw error;
  }
}
```

---

## 9. لوحة التحكم وقائمة المستخدمين

### 🔹 ملخص لوحة التحكم: `GET /api/dashboard`
- **الصلاحية المطلوبة**: مسجل الدخول (`auth:api`).
- **البيانات**: عدد المنتجات النشطة والطلبات اليوم وإجمالي الطلبات والمبيعات.
- يعيد `total_users` للمشرف فقط، ويعيد `null` للعميل. أرقام الطلبات والمبيعات للعميل تخص طلباته وحدها.

### 🔹 قائمة المستخدمين: `GET /api/users` (Admin)
- **الصلاحية المطلوبة**: مشرف فقط (`role: admin`).
- **الاستجابة**: قائمة مرقمة من 15 مستخدمًا، مع الاسم والبريد والصلاحية وتاريخ التسجيل، ولا تتضمن كلمات المرور.

### فلترة الطلبات
يمكن إضافة معامل `status` إلى `GET /api/orders` أو `GET /api/admin/orders` لتصفية الطلبات بإحدى الحالات: `pending`, `confirmed`, `processing`, `shipped`, `delivered`, أو `cancelled`.
