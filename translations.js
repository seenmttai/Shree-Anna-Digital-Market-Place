// Tiny, dependency-free i18n: uses [data-translate] attributes and a local dictionary.
(function(){
  const dict = {
    en: {
      'hero.title':'Market for Farmers — Sell Your Millets & Pulses',
      'hero.subtitle':'Helping farmers, groups and buyers trade millets & pulses easily and fairly',
      'features.title':'What You Can Do Here',
      'cta.title':'Join & Start Selling',
      'cta.subtitle':"Join other farmers — sell your harvest, find buyers, and get better prices"
    },
    hi: {
      'hero.title':'किसानों का बाजार — अपने मिलेट और दाल बेचें',
      'hero.subtitle':'किसानों, समूह और खरीदारों को मिलेट व दाल का सरल और ईमानदार व्यापार करने में मदद',
      'features.title':'यहाँ आप क्या कर सकते हैं',
      'cta.title':'जुड़ें और बेचना शुरू करें',
      'cta.subtitle':'अन्य किसानों के साथ जुड़ें — अपनी फसल बेचें, खरीदार पायें और बेहतर दाम पायें'
    }
  };

  const SimpleI18n = {
    lang: localStorage.getItem('language') || 'en',
    t(key){ return (dict[this.lang] && dict[this.lang][key]) || (dict.en && dict.en[key]) || null; },
    apply(){
      document.querySelectorAll('[data-translate]').forEach(el => {
        const k = el.getAttribute('data-translate');
        const txt = SimpleI18n.t(k);
        if (txt) el.textContent = txt;
      });
      const sel = document.getElementById('langSelect');
      if (sel) sel.value = SimpleI18n.lang;
    },
    changeLanguage(lng){
      this.lang = lng || 'en';
      localStorage.setItem('language', this.lang);
      this.apply();
    }
  };

  window.SimpleI18n = SimpleI18n;
  document.addEventListener('DOMContentLoaded', () => SimpleI18n.apply());
})();