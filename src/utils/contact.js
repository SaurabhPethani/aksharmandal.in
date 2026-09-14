function internationalDigits(mobile) {
  const raw = String(mobile ?? '');
  if (/[a-z]/i.test(raw)) return '';
  const digits = raw.replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}`
    : digits.length === 12 && digits.startsWith('91') ? digits
      : digits.replace(/^0+/, '');
}

export function whatsAppUrl(mobile, message) {
  return `https://wa.me/${internationalDigits(mobile)}?text=${encodeURIComponent(message)}`;
}

export function telUrl(mobile) {
  return `tel:+${internationalDigits(mobile)}`;
}

export const hasMobile = (mobile) => {
  const raw = String(mobile ?? '');
  if (/[a-z]/i.test(raw)) return false;
  return raw.replace(/\D/g, '').length >= 10;
};

export function whatsAppTarget(member) {
  if (member && typeof member === 'object') {
    return member.whatsapp_number || member.mobile_number || '';
  }
  return member ?? '';
}

export const GREETING = 'Jai Swaminarayan';
