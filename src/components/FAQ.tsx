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
    question: "Millaisia kuvia voin käyttää lähdekuvina?",
    answer: "Parhaan tuloksen saat, kun lataat hyvälaatuisen lähikuvan, jossa kasvosi näkyvät selkeästi ja valaistus on tasainen. Vältä kuvia, joissa on aurinkolasit, hattu tai voimakkaita varjoja kasvoilla. Selfie toimii hyvin!"
  },
  {
    question: "Onko palvelu turvallinen? Miten tietoni käsitellään?",
    answer: "Kyllä, palvelu on täysin turvallinen. Käytämme Stripea maksujen käsittelyyn - emme näe luottokorttitietojasi. Kuvasi poistetaan automaattisesti 24 tunnin kuluttua, emmekä jaa niitä kenellekään. Olemme suomalainen yritys (Y-tunnus: 1870949-9) ja noudatamme EU:n tietosuoja-asetusta (GDPR)."
  },
  {
    question: "En ole teknisesti lahjakas. Onko tämä vaikeaa?",
    answer: "Ei ole! Palvelu on suunniteltu erittäin helpoksi. Tarvitset vain: 1) Kuvan itsestäsi (voit ottaa puhelimella), 2) Paina 'Kokeile ilmaiseksi' -nappia, 3) Odota hetki, 4) Jos tulos miellyttää, osta kuva. Koko prosessi kestää alle 2 minuuttia."
  },
  {
    question: "Voinko käyttää kuvaa virallisissa asiakirjoissa?",
    answer: "Kuva sopii erinomaisesti CV:hen, someen, yrityksen nettisivuille ja sosiaaliseen mediaan. Virallisiin henkilöllisyystodistuksiin (passi, ajokortti) tarvitaan viranomaisen hyväksymä kuva, johon tämä ei sovellu."
  },
  {
    question: "Miten voin maksaa kuvani?",
    answer: "Esikatsekuvan alapuolella on maksupainike joka ohjaa kassasivulle. Maksutapoina on käytössä suomalaiset verkkopankit, luottokortti, Mobilepay sekä Apple Pay."
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
  },
  {
    question: "Minulla on ongelmia kuvan latauksen kanssa. Mitä tehdä?",
    answer: "Ota yhteyttä info@muotokuvasi.fi niin autamme sinua."
  },
  {
    question: "Tarvitsemme yrityksellemme koko henkilöstöstä edustavat valokuvat. Voitteko auttaa?",
    answer: (
      <>
        Kyllä onnistuu. Isommat kuvatilaukset voidaan räätälöidä tarpeisiinne ja toimittaa yhtenä pakettina. Lue lisää <a href="/yrityskuvaus" className="font-semibold underline decoration-2 underline-offset-2 hover:text-[#234b4d]/80">yrityskuvauksesta</a> tai ota yhteyttä info@muotokuvasi.fi.
      </>
    )
  },
  {
    question: "Onko tämä joku tekoälyhuijaus?",
    answer: (
      <>
        Uusi teknologia herättää aina epäilyksiä. Lyhyt vastaus on: <strong>Ei ole.</strong> Olemme aito palvelu, joka tarjoaa vastineen rahoillesi. Tässä muutama fakta toiminnastamme:
        <br /><br />
        <strong>Turvallinen maksu:</strong> Käytämme maksujen välitykseen maailmanlaajuisesti tunnettua Stripea. Me emme koskaan näe tai tallenna luottokorttitietojasi.
        <br /><br />
        <strong>Tietosuoja edellä:</strong> Emme myy kuviasi kolmansille osapuolille. Sekä lataamasi että generoidut kuvat poistetaan palvelimiltamme automaattisesti 24 tunnin kuluessa.
        <br /><br />
        <strong>Aito teknologia:</strong> Palvelumme pohjautuu uusimpaan kuvagenerointiteknologiaan, joka luo kuvat oikeasti, ei vain filtteröi niitä.
        <br /><br />
        <strong>Asiakaspalvelu:</strong> Jos sinulla on kysyttävää, oikea ihminen asiakaspalvelussamme auttaa sinua.
      </>
    )
  }
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleItem = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="w-full max-w-3xl mx-auto mt-24 px-4 mb-12">
      <h2 className="text-4xl font-semibold text-center text-[#234b4d] mb-8">Usein kysyttyä</h2>
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
                openIndex === index ? 'max-h-120 opacity-100' : 'max-h-0 opacity-0'
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
