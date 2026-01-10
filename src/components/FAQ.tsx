import React, { useState } from 'react';

type FAQItem = {
  question: string;
  answer: React.ReactNode;
};

const FAQ_DATA: FAQItem[] = [
  {
    question: "Miten palvelu toimii?",
    answer: "Lataa palveluun tavallinen kuva kasvoistasi. Tekoälymme analysoi kuvan ja luo siitä ammattimaisen version valitsemallasi taustalla ja vaatetuksella. Voit esikatsella lopputulosta (vesileimalla) ilmaiseksi. Jos olet tyytyväinen, voit ostaa kuvan ilman vesileimaa."
  },
  {
    question: "Mitä kuvia minun kannattaa ladata?",
    answer: "Parhaan tuloksen saat, kun lataat hyvälaatuisen kuvan, jossa kasvosi näkyvät selkeästi ja valaistus on tasainen. Vältä kuvia, joissa on aurinkolasit, hattu tai voimakkaita varjoja kasvoilla. Selfie toimii hyvin!"
  },
  {
    question: "Säilyvätkö kuvani palvelussa?",
    answer: "Eivät. Lataamasi alkuperäinen kuva poistetaan heti kun generointi on valmis. Valmis generoitu kuva säilytetään 24 tuntia, jotta ehdit ladata sen itsellesi maksun jälkeen, minkä jälkeen se poistetaan automaattisesti."
  },
  {
    question: "Saanko kuvaan täydet käyttöoikeudet?",
    answer: "Kyllä. Kun ostat kuvan, saat siihen täydet käyttöoikeudet. Voit käyttää kuvaa vapaasti esimerkiksi LinkedInissä, CV:ssä, kotisivuilla tai sosiaalisessa mediassa."
  },
  {
    question: "Mitä jos en ole tyytyväinen tulokseen?",
    answer: "Esikatselu on täysin ilmainen, joten et maksa mitään ennen kuin näet lopputuloksen. Jos et ole tyytyväinen ensimmäiseen versioon, voit kokeilla ladata eri kuvan tai vaihtaa asetuksia ja generoida uuden kuvan veloituksetta."
  }
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleItem = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="w-full max-w-3xl mx-auto mt-24 px-4 mb-12">
      <h2 className="text-3xl font-semibold text-center text-[#234b4d] mb-8">Usein kysyttyä</h2>
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
              <span className="font-medium text-gray-800 text-lg">{item.question}</span>
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
                openIndex === index ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <div className="px-6 pb-6 pt-0 text-gray-600 leading-relaxed border-t border-stone-50">
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
