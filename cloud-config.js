/* إعدادات المزامنة السحابية (Supabase).
   url  : عنوان مشروعك على Supabase.
   key  : المفتاح العام (Publishable key) فقط — هو مصمَّم ليكون ظاهراً في الصفحة،
          ولا تضع هنا أبداً المفتاح السري (secret / service_role).
   اتركي key فارغاً لتعطيل المزامنة؛ تبقى القوارئ تحفظ محلياً كما كانت. */
window.READER_CLOUD_CONFIG = {
  url: 'https://usylwbhpzkfyquhzoisg.supabase.co',
  key: ''
};
