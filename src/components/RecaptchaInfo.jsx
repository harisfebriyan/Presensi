import React from 'react';
import { Info, ExternalLink } from 'lucide-react';

const RecaptchaInfo = () => {
  return (
    <div className="mt-4 p-4 bg-blue-50 rounded-lg">
      <div className="flex items-start space-x-3">
        <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-blue-800 font-medium">Informasi reCAPTCHA</p>
          <p className="text-blue-700 text-sm mt-1">
            Situs ini dilindungi oleh reCAPTCHA dan berlaku
            <a 
              href="https://policies.google.com/privacy" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 mx-1"
            >
              Kebijakan Privasi
              <ExternalLink className="h-3 w-3 inline ml-1" />
            </a>
            dan
            <a 
              href="https://policies.google.com/terms" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 mx-1"
            >
              Persyaratan Layanan
              <ExternalLink className="h-3 w-3 inline ml-1" />
            </a>
            Google.
          </p>
        </div>
      </div>
    </div>
  );
};

export default RecaptchaInfo;