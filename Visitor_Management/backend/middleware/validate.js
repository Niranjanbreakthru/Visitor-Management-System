// ID format validators (placeholder)
const validators = {
  passport: (num) => /^[A-Z]{2}\d{7}$/.test(num),
  drivers_license: (num) => /^[A-Z]{2}\d{2}\s?\d{11}$/.test(num),
  national_id: (num) => /^\d{11}$/.test(num),
  voter_card: (num) => /^\d{19}$/.test(num)
};

const validateId = (req, res, next) => {
  const { id_type, id_number } = req.body;

  if (!id_type || !id_number) {
    return res.status(400).json({ ok: false, error: 'ID type and number required' });
  }

  const validator = validators[id_type];
  if (!validator) return res.status(400).json({ ok: false, error: 'Invalid ID type' });

  if (!validator(id_number)) {
    return res.status(400).json({ ok: false, error: `Invalid ${id_type.replace('_', ' ')} format` });
  }

  next();
};

const validatePhone = (phone) => /^(0|\+234)[789]\d{9}$/.test(String(phone || '').replace(/\s/g, ''));

module.exports = { validateId, validatePhone };

