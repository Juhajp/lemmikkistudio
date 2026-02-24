import React, { useState } from 'react';

type FAQItem = {
  question: string;
  answer: React.ReactNode;
};

const FAQ_DATA: FAQItem[] = [
  {
    question: "Miten palvelu toimii?",
    answer: "Lataa palveluun kuva lemmikistäsi (esim. koira tai kissa). Tekoäly analysoi kuvan ja luo siitä ammattimaisen studiomuotokuvan. Voit esikatsella tulosta (vesileimalla) ilmaiseksi. Jos olet tyytyväinen, voit ostaa valmiin kuvan ilman vesileimaa."
  },
  {
    question: "Millaisia kuvia voin käyttää lähdekuvina?",
    answer: "Parhaan tuloksen saat, kun lataat selkeän kuvan lemmikistäsi, jossa eläin näkyy hyvin ja valaistus on kohtuullinen. Vältä liian pimeitä tai sumuisia kuvia. Älykännykällä otettu kuva toimii hyvin – tärkeintä on, että lemmikin piirteet erottuvat."
  },
  {
    question: "Onko palvelu turvallinen? Miten tietoni käsitellään?",
    answer: "Kyllä, palvelu on turvallinen. Käytämme Stripea maksujen käsittelyyn – emme näe luottokorttitietojasi. Kuvasi poistetaan automaattisesti 24 tunnin kuluttua, emmekä jaa niitä kolmansille. Olemme suomalainen toimija ja noudatamme EU:n tietosuoja-asetusta (GDPR)."
  },
  {
    question: "Onko tämä vaikeaa käyttää?",
    answer: "Ei. Tarvitset vain: 1) Kuvan lemmikistäsi (voit ottaa puhelimella), 2) Lataa se palveluun ja paina 'Kokeile ilmaiseksi', 3) Odota generointi, 4) Jos tulos miellyttää, osta kuva. Koko prosessi kestää vain muutaman minuutin."
  },
  {
    question: "Mihin voin käyttää valmista muotokuvaa?",
    answer: "Voit käyttää kuvaa vapaasti esim. someen, seinäkuvaksi, lahjaksi tai nettisivuillesi. Kuva sopii sekä omaan käyttöön että lahjaksi – ammattimainen muotokuva on erityinen muisto lemmikistäsi."
  },
  {
    question: "Miten voin maksaa kuvani?",
    answer: "Esikatsekuvan alapuolella on maksupainike, joka ohjaa kassasivulle. Maksutapoina ovat mm. suomalaiset verkkopankit, luottokortti sekä Apple Pay."
  },
  {
    question: "Säilyvätkö kuvani palvelussa?",
    answer: "Eivät. Lataamasi alkuperäinen kuva poistetaan generoinnin jälkeen. Valmis muotokuva säilytetään 24 tuntia, jotta ehdit ladata sen itsellesi maksun jälkeen – sen jälkeen se poistetaan automaattisesti."
  },
  {
    question: "Saanko kuvaan täydet käyttöoikeudet?",
    answer: "Kyllä. Kun ostat kuvan, saat siihen täydet käyttöoikeudet. Voit käyttää muotokuvaa vapaasti esim. someen, tulostukseen, lahjaksi tai omaan muistikokoelmaan."
  },
  {
    question: "Mitä jos en ole tyytyväinen tulokseen?",
    answer: "Esikatselu on ilmainen, joten et maksa mitään ennen kuin näet lopputuloksen. Jos tulos ei miellytä, voit kokeilla eri lähdekuvaa tai generoida uuden kuvan veloituksetta."
  },
  {
    question: "Minulla on ongelmia kuvan latauksen kanssa. Mitä tehdä?",
    answer: "Ota yhteyttä info@muotokuvasi.fi niin autamme sinua."
  },
  {
    question: "Toimivatko muut lemmikit kuin koirat?",
    answer: "Palvelu on erityisesti koirien muotokuvaukseen suunniteltu, mutta kokeile mielellään myös kissoilla tai muilla lemmikeillä – tulokset vaihtelevat kuvan laadun ja eläimen piirteiden mukaan."
  },
  {
    question: "Onko tämä joku tekoälyhuijaus?",
    answer: (
      <>
        Lyhyt vastaus: <strong>Ei.</strong> Olemme aito palvelu, joka tuottaa ammattimaisia muotokuvia lemmikeistäsi. Turvallinen maksu Stripen kautta (emme näe korttitietojasi), kuvat poistetaan automaattisesti 24 h kuluttua, emmekä jaa niitä eteenpäin. Jos jotakin askarruttaa, ota yhteyttä info@muotokuvasi.fi.
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
