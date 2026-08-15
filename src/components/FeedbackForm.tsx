import React, { useState } from 'react';

interface FormData {
  rating: number;
  message: string;
  email: string;
  orderReference: string;
}

export default function FeedbackForm() {
  const [formData, setFormData] = useState<FormData>({
    rating: 0,
    message: '',
    email: '',
    orderReference: '',
  });

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.rating === 0) {
      setStatus('error');
      setErrorMessage('Valitse arvosana ennen lähettämistä.');
      return;
    }

    setStatus('loading');
    setErrorMessage('');

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        setStatus('success');
        setFormData({
          rating: 0,
          message: '',
          email: '',
          orderReference: '',
        });
      } else {
        setStatus('error');
        setErrorMessage(data.error || 'Palautteen lähetys epäonnistui.');
      }
    } catch {
      setStatus('error');
      setErrorMessage('Verkkovirhe. Tarkista yhteytesi ja yritä uudelleen.');
    }
  };

  if (status === 'success') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
        <div className="text-5xl mb-4">✓</div>
        <h3 className="text-2xl font-bold text-green-800 mb-2">Kiitos palautteestasi!</h3>
        <p className="text-green-700 mb-6">
          Arvostamme mielipidettäsi ja käytämme sitä palvelun kehittämiseen.
        </p>
        <button
          onClick={() => setStatus('idle')}
          className="text-green-600 hover:text-green-800 font-medium underline"
        >
          Lähetä uusi palaute
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <p className="block text-sm font-medium text-gray-700 mb-3">
          Arvosana <span className="text-red-500">*</span>
        </p>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setFormData({ ...formData, rating: star })}
              className={`text-4xl transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-[#234b4d] rounded ${
                star <= formData.rating ? 'text-[#d27ea0]' : 'text-gray-300'
              }`}
              aria-label={`${star} tähteä`}
            >
              ★
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
          Palaute <span className="text-red-500">*</span>
        </label>
        <textarea
          id="message"
          name="message"
          value={formData.message}
          onChange={handleChange}
          required
          rows={5}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#234b4d] focus:border-transparent transition-all resize-none"
          placeholder="Kerro kokemuksestasi Lemmikkistudio-palvelusta..."
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
          Sähköposti <span className="text-gray-400 text-xs">(valinnainen)</span>
        </label>
        <input
          type="email"
          id="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#234b4d] focus:border-transparent transition-all"
          placeholder="sähköposti@example.com"
        />
      </div>

      <div>
        <label htmlFor="orderReference" className="block text-sm font-medium text-gray-700 mb-2">
          Tilausviite <span className="text-gray-400 text-xs">(valinnainen)</span>
        </label>
        <input
          type="text"
          id="orderReference"
          name="orderReference"
          value={formData.orderReference}
          onChange={handleChange}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#234b4d] focus:border-transparent transition-all"
          placeholder="Stripe-tilausnumero tai muu viite"
        />
      </div>

      {status === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {errorMessage}
        </div>
      )}

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
          'Lähetä palaute'
        )}
      </button>

      <p className="text-sm text-gray-500 text-center">
        Tietosi käsitellään luottamuksellisesti asiakaspalvelua varten.
      </p>
    </form>
  );
}
