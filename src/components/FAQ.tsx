import React, { useState } from 'react';

type FAQItem = {
  question: string;
  answer: React.ReactNode;
};

const FAQ_DATA: FAQItem[] = [
  {
    question: "Miten Lemmikkistudio toimii?",
    answer: "Lataa koirasi kuva palveluun, valitse rodun nimi (valinnainen) ja paina ’Kokeile ilmaiseksi’. Tekoäly luo kuvasta ammattimaisen studiomuotokuvan. Tuloksen näet erillisellä sivulla – jos olet tyytyväinen, voit ostaa kuvan ilman vesileimaa."
  },
  {
    question: "Millaisesta kuvasta tulee paras studiomuotokuva?",
    answer: "Paras tulos tulee, kun koira on seisovassa asennossa etuviistosta kuvattuna, kasvot ja takapää näkyvät selkeästi. Kuvaa noin metrin korkeudelta niin, että koira täyttää kuvaruudun. Hyvä valaistus ja terävä kuva ovat tärkeitä – sivun ohjeet auttavat askel askeleelta."
  },
  {
    question: "Miten maksu toimii?",
    answer: "Maksu tapahtuu turvallisesti Stripen kautta (verkkopankki, kortti, Apple Pay). Näet ensin vesileimatun esikatselukuvan, ja ostat kuvan vasta, jos olet tyytyväinen lopputulokseen. Maksun jälkeen sinut ohjataan sivulle, josta saat täyden resoluution kuvan latauslinkin."
  },
  {
    question: "Miten lataan kuvat?",
    answer: "Kun olet ostanut kuvan, sinut ohjataan tulossivulle, josta löydät täyden resoluution latauslinkin. Lisäksi lähetämme sinulle sähköpostin, jossa on suora linkki kuvan lataamiseen myöhemmin. Ladatut ja generoidut kuvat säilytetään palvelimilla enintään 7 päivää, jotta ehdit ladata kuvan turvallisesti talteen – tämän jälkeen linkit lakkaavat toimimasta, emmekä enää säilytä kuvaa."
  },
  {
    question: "Minkä kokoinen lopullinen kuva on?",
    answer: "Lopullinen ostettava kuva on 3072×4608 pikseliä (noin 4K-tarkkuus). Tiedosto on riittävän iso, jotta siitä voi teettää esimerkiksi laadukkaan taulun tai muun sisustuselementin."
  },
  {
    question: "Saanko ostamaani muotokuvaan täydet käyttöoikeudet?",
    answer: "Kyllä. Kun ostat kuvan, saat siihen täydet käyttöoikeudet. Voit käyttää sitä vapaasti esim. someen, valokuvatulostukseen, seinäkuvaksi tai lahjaksi."
  },
  {
    question: "Onko palvelu turvallinen ja tietosuojattu?",
    answer: "Kyllä. Olemme suomalainen toimija ja noudatamme GDPR:tä. Emme näe korttitietojasi (Stripe hoitaa maksut). Kuvat käsitellään vain palvelun toimittamiseksi ja poistetaan automaattisesti."
  }
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleItem = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="w-full max-w-3xl mx-auto mt-24 px-4 mb-12 text-base md:text-lg" style={{ fontFamily: 'Urbanist, sans-serif' }}>
      <h2 className="text-5xl font-semibold text-center text-white mb-8" style={{ fontFamily: 'Prata, serif' }}>Usein kysyttyä</h2>
      <div className="flex flex-col gap-4">
        {FAQ_DATA.map((item, index) => (
          <div 
            key={index}
            className="bg-white rounded-xl shadow-sm border border-stone-100 overflow-hidden transition-all duration-200"
          >
            <button
              onClick={() => toggleItem(index)}
              className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-stone-50 transition-colors focus:outline-none"
            >
              <span className="font-medium text-gray-800 text-xl">{item.question}</span>
              <svg 
                className={`w-6 h-6 text-gray-400 transform transition-transform duration-200 ${openIndex === index ? 'rotate-180' : ''}`}
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            <div 
              className={`transition-all duration-300 ease-in-out overflow-hidden ${
                openIndex === index ? 'max-h-120 opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <div className="px-6 pb-6 pt-0 text-gray-600 leading-relaxed border-t border-stone-50 text-base md:text-lg">
                <div className="pt-4">
                    {item.answer}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
