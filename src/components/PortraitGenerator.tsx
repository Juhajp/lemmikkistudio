import React, { useState } from 'react';

export default function PortraitGenerator() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const objectUrl = URL.createObjectURL(file);
      setPreview(objectUrl);
      setGeneratedImage(null);
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
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
      });

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 }),
      });

      if (!response.ok) throw new Error('Generointi epäonnistui');

      const data = await response.json();
      setGeneratedImage(data.image);
    } catch (err) {
      console.error(err);
      setError('Jotain meni pieleen. Kokeile uudestaan.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-xl shadow-md space-y-6">
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Lataa kasvokuva</label>
        <input 
          type="file" 
          accept="image/*" 
          onChange={handleFileChange}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100"
        />
      </div>

      {loading && (
        <div className="text-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-700 mx-auto"></div>
          <p className="mt-2 text-gray-600">Tekoäly taiteilee...</p>
        </div>
      )}

      {error && <p className="text-red-500 text-center">{error}</p>}

      {generatedImage ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-2">
            <h3 className="text-center font-medium text-gray-500">Alkuperäinen</h3>
            <div className="border rounded-lg overflow-hidden">
              <img src={preview!} alt="Original" className="w-full h-auto object-cover" />
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-center font-bold text-violet-700">Valmis Muotokuva</h3>
            <div className="rounded-lg overflow-hidden shadow-lg border-2 border-violet-100">
              <img src={`data:image/png;base64,${generatedImage}`} alt="Generated" className="w-full h-auto object-cover" />
            </div>
            <a 
              href={`data:image/png;base64,${generatedImage}`} 
              download="muotokuva.png"
              className="block w-full py-3 bg-violet-600 text-white text-center rounded-lg font-bold hover:bg-violet-700 transition"
            >
              Lataa kuva
            </a>
          </div>
        </div>
      ) : (
        preview && !loading && (
          <div className="max-w-xl mx-auto space-y-6">
            <div className="border rounded-lg overflow-hidden">
               <img src={preview} alt="Original" className="w-full h-auto object-cover" />
            </div>
            <button 
              onClick={handleGenerate}
              className="w-full py-3 bg-black text-white rounded-lg font-bold hover:bg-gray-800 transition"
            >
              Luo Muotokuva
            </button>
          </div>
        )
      )}
    </div>
  );
}
