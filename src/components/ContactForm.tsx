import React, { useState } from 'react';

interface FormData {
  name: string;
  email: string;
  company: string;
  teamSize: string;
  phone: string;
  message: string;
}

export default function ContactForm() {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    company: '',
    teamSize: '',
    phone: '',
    message: '',
  });

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setErrorMessage('');

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        setStatus('success');
        setFormData({
          name: '',
          email: '',
          company: '',
          teamSize: '',
          phone: '',
          message: '',
        });
      } else {
        setStatus('error');
        setErrorMessage(data.error || 'Viestin lähetys epäonnistui.');
      }
    } catch (error) {
      setStatus('error');
      setErrorMessage('Verkkovirhe. Tarkista yhteytesi ja yritä uudelleen.');
    }
  };

  if (status === 'success') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
        <div className="text-5xl mb-4">✓</div>
        <h3 className="text-2xl font-bold text-green-800 mb-2">Kiitos yhteydenotostasi!</h3>
        <p className="text-green-700 mb-6">
          Vastaamme tarjouspyyntöösi 24 tunnin kuluessa.
        </p>
        <button
          onClick={() => setStatus('idle')}
          className="text-green-600 hover:text-green-800 font-medium underline"
        >
          Lähetä uusi viesti
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        {/* Nimi */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
            Nimi <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#234b4d] focus:border-transparent transition-all"
            placeholder="Matti Meikäläinen"
          />
        </div>

        {/* Sähköposti */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
            Sähköposti <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#234b4d] focus:border-transparent transition-all"
            placeholder="matti@yritys.fi"
          />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Yritys */}
        <div>
          <label htmlFor="company" className="block text-sm font-medium text-gray-700 mb-2">
            Yritys <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="company"
            name="company"
            value={formData.company}
            onChange={handleChange}
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#234b4d] focus:border-transparent transition-all"
            placeholder="Yritys Oy"
          />
        </div>

        {/* Henkilömäärä */}
        <div>
          <label htmlFor="teamSize" className="block text-sm font-medium text-gray-700 mb-2">
            Arvioitu henkilömäärä <span className="text-red-500">*</span>
          </label>
          <select
            id="teamSize"
            name="teamSize"
            value={formData.teamSize}
            onChange={handleChange}
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#234b4d] focus:border-transparent transition-all bg-white"
          >
            <option value="">Valitse...</option>
            <option value="1-5">1-5 henkilöä</option>
            <option value="6-10">6-10 henkilöä</option>
            <option value="11-20">11-20 henkilöä</option>
            <option value="21-50">21-50 henkilöä</option>
            <option value="50+">Yli 50 henkilöä</option>
          </select>
        </div>
      </div>

      {/* Puhelinnumero (valinnainen) */}
      <div>
        <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
          Puhelinnumero <span className="text-gray-400 text-xs">(valinnainen)</span>
        </label>
        <input
          type="tel"
          id="phone"
          name="phone"
          value={formData.phone}
          onChange={handleChange}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#234b4d] focus:border-transparent transition-all"
          placeholder="+358 40 123 4567"
        />
      </div>

      {/* Viesti (valinnainen) */}
      <div>
        <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
          Lisätiedot <span className="text-gray-400 text-xs">(valinnainen)</span>
        </label>
        <textarea
          id="message"
          name="message"
          value={formData.message}
          onChange={handleChange}
          rows={4}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#234b4d] focus:border-transparent transition-all resize-none"
          placeholder="Kerro meille lisää tarpeistanne..."
        />
      </div>

      {/* Virheviesti */}
      {status === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {errorMessage}
        </div>
      )}

      {/* Lähetä-nappi */}
      <button
        type="submit"
        disabled={status === 'loading'}
        className="w-full py-4 bg-[#234b4d] hover:bg-black text-white rounded-lg font-bold text-lg transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === 'loading' ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Lähetetään...
          </span>
        ) : (
          'Lähetä tarjouspyyntö'
        )}
      </button>

      <p className="text-sm text-gray-500 text-center">
        Vastaamme yleensä 24 tunnin kuluessa. Tietosi käsitellään luottamuksellisesti.
      </p>
    </form>
  );
}
