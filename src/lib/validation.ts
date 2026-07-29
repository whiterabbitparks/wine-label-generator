export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidateFormResult {
  isValid: boolean;
  errors: ValidationError[];
}

export function validateFrontLabelForm(formData: {
  wine: string;
  producer: string;
  appellation: string;
  vintage: string;
}): ValidateFormResult {
  const errors: ValidationError[] = [];

  if (!formData.wine?.trim()) {
    errors.push({ field: 'wine', message: 'Wine name is required' });
  }

  if (!formData.producer?.trim()) {
    errors.push({ field: 'producer', message: 'Producer name is required' });
  }

  if (!formData.appellation?.trim()) {
    errors.push({ field: 'appellation', message: 'Appellation is required' });
  }

  if (!formData.vintage?.trim()) {
    errors.push({ field: 'vintage', message: 'Vintage year is required' });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
