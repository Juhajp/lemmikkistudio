import React, { useState, useEffect } from 'react';

// Cloudflare Turnstile type definitions
declare global {
  interface Window {
    turnstile: {
      render: (container: string, options: {
        sitekey: string;
        callback: (token: string) => void;
        'error-callback': () => void;
      }) => void;
      reset: () => void;
    };
  }
}

const BACKGROUND_OPTIONS = [
  { id: 'studio', label: 'Tummanharmaa studio (Oletus)' },
  { id: 'beige_studio', label: 'Beige studio' },
  { id: 'black', label: 'Musta tausta' },
  { id: 'white', label: 'Valkoinen tausta' },
  { id: 'outdoor', label: 'Ulkoilma' },
  { id: 'office', label: 'Toimisto' },
  { id: 'color_blue', label: 'Taustaväri: Sininen' },
  { id: 'color_red', label: 'Taustaväri: Punainen' },
  { id: 'color_orange', label: 'Taustaväri: Oranssi' },
  { id: 'color_green', label: 'Taustaväri: Vihreä' },
  { id: 'color_teal', label: 'Taustaväri: Teal' },
];

const CLOTHING_OPTIONS = [
  { id: 'blazer', label: 'Tumma bleiseri (Oletus)' },
  { id: 'beige_blazer', label: 'Beige bleiseri' },
  { id: 'blue_dress_shirt', label: 'Sininen kauluspaita' },
  { id: 'sweater_light', label: 'Vaalea neule' },
  { id: 'navy_sweater', label: 'Tummansininen neule' },
  { id: 'turtleneck_black', label: 'Musta poolopaita' },
  { id: 'tshirt_grey', label: 'Harmaa t-paita (Smart Casual)' },
  { id: 'tshirt_black', label: 'Musta t-paita' },
  { id: 'original', label: 'Säilytä alkuperäiset vaatteet' },
];

export default function PortraitGenerator() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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
      setError(null);
    }
  };

  const handleGenerate = async () => {
    if (!selectedFile) return;
    setLoading(true);
    setError(null);

    try {
      // 1. CLOUDFLARE TURNSTILE: Pyydä bot-suojaus token (ohita preview-ympäristössä)
      let turnstileToken: string;
      
      // Tarkista onko preview-ympäristö (Vercel preview-deploy)
      const isPreview = window.location.hostname.includes('.vercel.app') && 
                       !window.location.hostname.includes('muotokuvasi.fi');
      
      if (isPreview) {
        // Preview-ympäristössä: ohita Turnstile-tokenin generointi
        console.log('⚠️ Preview-ympäristö: Turnstile-validointi ohitettu');
        turnstileToken = 'preview-bypass-token';
      } else {
        // Tuotannossa: vaadi Turnstile-token
        try {
          turnstileToken = await new Promise<string>((resolve, reject) => {
            // Tarkista että Turnstile on ladattu
            if (!window.turnstile) {
              reject(new Error('Turvallisuuspalvelu ei ole vielä ladannut. Yritä hetken kuluttua uudelleen.'));
              return;
            }
            
            window.turnstile.render('#turnstile-widget', {
              sitekey: import.meta.env.PUBLIC_TURNSTILE_SITE_KEY || '1x00000000000000000000AA',
              callback: (token: string) => resolve(token),
              'error-callback': () => reject(new Error('Turvallisuustarkistus epäonnistui')),
            });
          });
        } catch (turnstileErr: any) {
          throw new Error(turnstileErr.message || 'Turvallisuustarkistus epäonnistui. Yritä uudelleen.');
        }
      }

      // 2. Luo base64 kuva (nykyinen koodi)
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

      // 3. Lähetä API:lle base64 + Turnstile token
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        
        body: JSON.stringify({ 
            image: base64,
            background: background,
            clothing: clothing,
            cfTurnstileToken: turnstileToken, // Bot-suojaus token
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Generointi epäonnistui');
      }

      // Tallennetaan tuloksen token ja ohjataan tulossivulle
      const tokenRes = await fetch('/api/result-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchaseToken: data.purchaseToken,
          thumbnailUrl: data.thumbnailUrl ?? null,
        }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.token) {
        throw new Error(tokenData.error || 'Tulossivun luonti epäonnistui');
      }

      // Update remaining count
      if (remainingGenerations !== null) {
        setRemainingGenerations(Math.max(0, remainingGenerations - 1));
      }

      window.location.href = `/result?t=${tokenData.token}`;
      return;
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Jotain meni pieleen. Kokeile uudestaan.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      {/* Settings Selection */}
      <div className="mt-8 mb-8 w-full max-w-4xl mx-auto flex flex-col sm:flex-row gap-4 justify-center">
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

      {/* Main Grid: vasemmalla ohjeet (desktop), oikealla lataus */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-12 mx-auto max-w-5xl">
        {/* Ohjeet kuvan ottamiseen (vasemmalla desktopissa) */}
        <div className="flex flex-col gap-4 order-2 lg:order-1">
          <div className="bg-white p-6 rounded-[28px] shadow-sm border border-stone-100 h-full flex flex-col">
            <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-stone-100 text-sm">1</span>
              Ohjeet kuvan ottamiseen
            </h2>
            <ul className="text-gray-600 space-y-3 text-left list-disc list-inside">
              <li>Lemmikki näkyy selkeästi ja kasvot / piirteet erottuvat</li>
              <li>Hyvä valaistus – vältä voimakkaita varjoja</li>
              <li>Älypuhelimella otettu kuva toimii hyvin</li>
              <li>Vältä liian sumuisia tai pimeitä kuvia</li>
            </ul>
            <p className="text-xs text-gray-400 mt-4">
              Tekoäly luo kuvastasi ammattimaisen studiomuotokuvan. Valmis tulos näytetään erillisellä sivulla.
            </p>
          </div>
        </div>

        {/* Lähdekuva ja generointi (oikealla desktopissa) */}
        <div className="flex flex-col gap-4 order-1 lg:order-2">
          <div className="bg-white p-6 rounded-[28px] shadow-sm border border-stone-100 h-full flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-stone-100 text-sm">2</span>
                Lähdekuva
              </h2>
            </div>

            <div className="flex-grow flex flex-col items-center justify-center">
              {loading ? (
                <div className="flex flex-col items-center justify-center text-gray-400 space-y-4 w-full py-12">
                  <div className="w-full aspect-[3/4] max-w-sm bg-stone-50 rounded-2xl animate-pulse flex items-center justify-center">
                    <svg className="w-16 h-16 text-stone-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium">Tekoäly käsittelee kuvaa...</p>
                  <p className="text-xs text-gray-400">Tämä kestää noin 20–40 sekuntia. Ohjataan tulossivulle.</p>
                </div>
              ) : !preview ? (
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
                  <img src={preview} alt="Lähdekuva" className="w-full h-full object-cover" />
                  <label className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm text-gray-800 px-4 py-2 rounded-full text-sm font-medium shadow-sm cursor-pointer hover:bg-white transition-colors">
                    Vaihda kuva
                    <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                  </label>
                </div>
              )}
              <p className="text-xs text-gray-400 mt-4 text-center leading-relaxed px-4">
                Lataamalla kuvan vahvistat, että sinulla on kuvaan käyttöoikeus. Palvelu käyttää tekoälyä kuvien muokkaamiseen.
              </p>
            </div>

            {/* Generointinappi */}
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
                    <span>Kokeile ilmaiseksi</span>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Cloudflare Turnstile widget (näkymätön) */}
      <div id="turnstile-widget" style={{ display: 'none' }}></div>
    </div>
  );
}
