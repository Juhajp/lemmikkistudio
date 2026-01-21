import React, { useState, useEffect } from 'react';

const BACKGROUND_OPTIONS = [
  { id: 'studio', label: 'Tummanharmaa studio (Oletus)' },
  { id: 'black', label: 'Musta tausta' },
  { id: 'white', label: 'Valkoinen tausta' },
  { id: 'outdoor', label: 'Ulkoilma (Bokeh)' },
  { id: 'office', label: 'Toimisto (Bokeh)' },
  { id: 'color_blue', label: 'Väri: Sininen' },
  { id: 'color_red', label: 'Väri: Punainen' },
  { id: 'color_orange', label: 'Väri: Oranssi' },
  { id: 'color_green', label: 'Väri: Vihreä' },
  { id: 'color_teal', label: 'Väri: Teal' },
  { id: 'color_beige', label: 'Väri: Beige' },
];

const CLOTHING_OPTIONS = [
  { id: 'blazer', label: 'Tumma bleiseri (Oletus)' },
  { id: 'sweater_light', label: 'Vaalea neule' },
  { id: 'turtleneck_black', label: 'Musta poolopaita' },
  { id: 'tshirt_grey', label: 'Harmaa t-paita (Smart Casual)' },
  { id: 'original', label: 'Säilytä alkuperäiset vaatteet' },
];

export default function PortraitGenerator() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [purchaseToken, setPurchaseToken] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [background, setBackground] = useState<string>("studio");
  const [clothing, setClothing] = useState<string>("blazer");
  const [remainingGenerations, setRemainingGenerations] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/check-limit')
      .then(res => res.json())
      .then(data => {
        if (typeof data.remaining === 'number') {
          setRemainingGenerations(data.remaining);
        }
      })
      .catch(err => console.error('Failed to check rate limit:', err));
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const objectUrl = URL.createObjectURL(file);
      setPreview(objectUrl);
      setGeneratedImage(null);
      setPurchaseToken(null);
      setThumbnailUrl(null);
      setError(null);
    }
  };

  const handleGenerate = async () => {
    if (!selectedFile) return;
    setLoading(true);
    setError(null);

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(selectedFile);
        reader.onload = async () => {
            try {
                // Image compression logic
                const img = new Image();
                img.src = reader.result as string;
                await new Promise((r) => (img.onload = r));

                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                // Max dimensions to keep size reasonable
                const MAX_WIDTH = 1500;
                const MAX_HEIGHT = 1500;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);

                // Compress to JPEG with 0.8 quality
                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
                resolve(compressedBase64);
            } catch (e) {
                reject(e);
            }
        };
        reader.onerror = (error) => reject(error);
      });

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        
        body: JSON.stringify({ 
            image: base64,
            background: background,
            clothing: clothing
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Generointi epäonnistui');
      }
      
      setGeneratedImage(data.image);
      setPurchaseToken(data.purchaseToken);
      setThumbnailUrl(data.thumbnailUrl);
      
      // Update remaining count
      if (remainingGenerations !== null) {
          setRemainingGenerations(Math.max(0, remainingGenerations - 1));
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Jotain meni pieleen. Kokeile uudestaan.');
    } finally {
      setLoading(false);
    }
  };

  const handleBuy = async () => {
    if (!purchaseToken) return;
    setBuying(true);
    setError(null);
    
    try {
        const response = await fetch('/api/create-checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                imageUrl: purchaseToken,
                thumbnailUrl: thumbnailUrl // Lähetä pikkukuva kassalle
            }),
        });

        const data = await response.json();
        
        if (!response.ok) {
             throw new Error(data.error || 'Maksusivun luonti epäonnistui');
        }

        if (data.url) {
            window.location.href = data.url;
        } else {
             throw new Error('Ei maksulinkkiä');
        }

    } catch(err: any) {
        console.error(err);
        setError(err.message || "Maksupalveluun siirtyminen epäonnistui");
    } finally {
        setBuying(false);
    }
  }

  return (
    <div className="w-full">
      {/* Example Images Section */}
      <div className="mb-12 w-full max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-center gap-6 md:gap-8 overflow-hidden px-4">
        {/* Source Image */}
        <div className="relative group shrink-0">
           <div className="w-40 h-40 rounded-full overflow-hidden border-4 border-white shadow-lg">
             <img src="/refkuva-orig.webp" alt="" className="w-full h-full object-cover" />
           </div>
        </div>

        {/* Arrow */}
        <div className="text-gray-700 shrink-0">
          {/* Right arrow for desktop */}
          <svg className="w-8 h-8 hidden md:block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
          {/* Down arrow for mobile */}
          <svg className="w-8 h-8 md:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>

        {/* Result Images */}
        <div className="grid grid-cols-2 md:flex md:items-center justify-items-center">
            {/* Image 1 - Centered on top (mobile) */}
            <div className="col-span-2 md:col-auto relative z-30 w-40 h-40 rounded-full overflow-hidden border-4 border-white shadow-lg shrink-0">
               <img src="/refkuva-1.webp" alt="" className="w-full h-full object-cover" />
            </div>

            {/* Image 2 - Left (mobile) */}
            <div className="col-span-1 md:col-auto relative z-20 w-40 h-40 rounded-full overflow-hidden border-4 border-white shadow-lg shrink-0 -mt-4 md:mt-0 -mr-4 md:mr-0 md:-ml-4 justify-self-end md:justify-self-auto">
               <img src="/refkuva-2.webp" alt="" className="w-full h-full object-cover" />
            </div>

            {/* Image 3 - Right (mobile) */}
            <div className="col-span-1 md:col-auto relative z-10 w-40 h-40 rounded-full overflow-hidden border-4 border-white shadow-lg shrink-0 -mt-4 md:mt-0 -ml-4 md:ml-0 md:-ml-4 justify-self-start md:justify-self-auto">
               <img src="/refkuva-3.webp" alt="" className="w-full h-full object-cover" />
            </div>
        </div>
      </div>

      {/* Settings Selection */}
      <div className="mb-8 w-full max-w-4xl mx-auto flex flex-col sm:flex-row gap-4 justify-center">
        {/* Background Selection */}
        <div className="w-full max-w-xs">
          <label className="block text-sm font-medium text-gray-700 mb-2 pl-1">Valitse tausta</label>
          <div className="relative">
              <select
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                  className="block w-full pl-4 pr-10 py-3 text-base border border-stone-200 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent sm:text-sm rounded-2xl bg-white shadow-sm appearance-none cursor-pointer hover:border-gray-400 transition-colors text-gray-800"
              >
                  {BACKGROUND_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                  ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-500">
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
              </div>
          </div>
        </div>

        {/* Clothing Selection */}
        <div className="w-full max-w-xs">
          <label className="block text-sm font-medium text-gray-700 mb-2 pl-1">Valitse vaatetus</label>
          <div className="relative">
              <select
                  value={clothing}
                  onChange={(e) => setClothing(e.target.value)}
                  className="block w-full pl-4 pr-10 py-3 text-base border border-stone-200 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent sm:text-sm rounded-2xl bg-white shadow-sm appearance-none cursor-pointer hover:border-gray-400 transition-colors text-gray-800"
              >
                  {CLOTHING_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                  ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-500">
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
              </div>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-3">
          <svg className="w-6 h-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p>{error}</p>
        </div>
      )}

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-12 mx-auto max-w-5xl">
        
        {/* INPUT CARD */}
        <div className="flex flex-col gap-4">
            <div className="bg-white p-6 rounded-[28px] shadow-sm border border-stone-100 h-full flex flex-col">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-stone-100 text-sm">1</span>
                        Lähdekuva
                    </h2>
                    
                </div>

                <div className="flex-grow flex flex-col items-center justify-center">
                    {!preview ? (
                        <label className="w-full aspect-[3/4] flex flex-col items-center justify-center border-2 border-dashed border-stone-300 rounded-2xl cursor-pointer hover:bg-stone-50 transition-colors bg-stone-50/50">
                            <div className="flex flex-col items-center text-center p-6 text-gray-500">
                                <svg className="w-12 h-12 mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <span className="font-medium text-lg text-gray-700">Valitse kuva</span>
                                <span className="text-sm mt-2">tai raahaa tiedosto tähän</span>

                            </div>
                            <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                        </label>
                    ) : (
                        <div className="relative w-full aspect-[3/4] rounded-2xl overflow-hidden bg-stone-100 group">
                            <img src={preview} alt="Input" className="w-full h-full object-cover" />
                            <label className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm text-gray-800 px-4 py-2 rounded-full text-sm font-medium shadow-sm cursor-pointer hover:bg-white transition-colors">
                                Vaihda kuva
                                <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                            </label>
                        </div>
                    )}
                    <p className="text-xs text-gray-400 mt-4 text-center leading-relaxed px-4">
                        Lataamalla kuvan vahvistat, että sinulla on kuvaan käyttöoikeus ja kuvassa esiintyvän henkilön suostumus. Toisten ihmisten kuvien luvaton käyttö on käyttöehtojemme vastaista.
                    </p>
                </div>

                {/* Generate Action Area */}
                <div className="mt-8 pt-6 border-t border-stone-100">
                    <div className="mb-2 text-center">
                       {remainingGenerations !== null && (
                         <span className={`text-sm font-medium ${remainingGenerations === 0 ? 'text-red-600' : 'text-gray-500'}`}>
                           Kuvia jäljellä tänään: {remainingGenerations}
                         </span>
                       )}
                    </div>
                    <button
                        onClick={handleGenerate}
                        disabled={!selectedFile || loading || remainingGenerations === 0}
                        className={`w-full py-4 px-6 rounded-full text-lg font-medium transition-all shadow-md flex items-center justify-center gap-3
                            ${(!selectedFile || remainingGenerations === 0)
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none' 
                                : 'bg-gray-900 text-white hover:bg-black hover:shadow-lg active:scale-[0.99]'
                            }`}
                    >
                        {loading ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Generoidaan...
                            </>
                        ) : (
                            <>
                                <span>Luo luonnos ilmaiseksi</span>
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                            </>
                        )}
                    </button>
                    {loading && <p className="text-center text-sm text-gray-500 mt-3 animate-pulse">Tämä kestää noin 20-40 sekuntia...</p>}
                </div>
            </div>
        </div>

        {/* OUTPUT CARD */}
        <div className="flex flex-col gap-4">
             <div className={`bg-white p-6 rounded-[28px] shadow-sm border border-stone-100 h-full flex flex-col ${!generatedImage && !loading ? 'opacity-80' : ''}`}>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-violet-100 text-violet-700 text-sm">2</span>
                        Esikatselu
                    </h2>
                    {generatedImage && (
                        <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
                            Vesileimattu
                        </span>
                    )}
                </div>

                <div className="flex-grow flex flex-col items-center justify-center min-h-[400px]">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center text-gray-400 space-y-4">
                             <div className="w-full aspect-[3/4] bg-stone-50 rounded-2xl animate-pulse flex items-center justify-center">
                                <svg className="w-16 h-16 text-stone-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                             </div>
                             <p className="text-sm">Tekoäly käsittelee kuvaa...</p>
                        </div>
                    ) : generatedImage ? (
                        <div className="w-full space-y-6">
                            <div className="relative w-full aspect-[3/4] rounded-2xl overflow-hidden shadow-lg border-4 border-white">
                                <img src={`data:image/png;base64,${generatedImage}`} alt="Generated" className="w-full h-full object-cover" />
                            </div>
                            
                            <button
                                onClick={handleBuy}
                                disabled={buying}
                                className="w-full py-4 bg-violet-600 text-white text-center rounded-full font-medium hover:bg-violet-700 transition shadow-md hover:shadow-lg flex items-center justify-center gap-2 active:scale-[0.99]"
                            >
                                {buying ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Avataan kassaa...
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                                        </svg>
                                        Osta nyt – 3,49 €
                                    </>
                                )}
                            </button>
                            <div className="text-center space-y-1">
                                <p className="text-xs text-gray-400">
                                    Saat täysikokoisen, vesileimattoman kuvan heti maksun jälkeen.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center text-gray-400 p-8 border-2 border-dashed border-stone-200 rounded-2xl w-full h-full flex flex-col items-center justify-center bg-stone-50/30">
                            <p>Valmis kuva ilmestyy tähän</p>
                        </div>
                    )}
                </div>
            </div>
        </div>

      </div>
    </div>
  );
}
