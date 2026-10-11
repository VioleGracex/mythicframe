export interface ShotDistancePreset {
  id: string;
  code: string;
  label: string;
  shortDescription: string;
  description: string;
  aliases?: string[];
}

export const SHOT_DISTANCE_PRESETS: ShotDistancePreset[] = [
  {
    id: 'extreme_close_up',
    code: 'ECU',
    label: 'ECU — Extreme Close-Up',
    shortDescription: 'Tiny facial detail',
    description: 'Tiny facial detail, such as an eye, lips, or another specific feature.',
    aliases: ['ecu']
  },
  {
    id: 'big_close_up',
    code: 'BCU',
    label: 'BCU — Big Close-Up',
    shortDescription: 'Entire face, forehead to chin',
    description: 'Entire face, from forehead to chin, with very little surrounding space.',
    aliases: ['bcu']
  },
  {
    id: 'close_up',
    code: 'CU',
    label: 'CU — Close-Up',
    shortDescription: 'Head and face dominate',
    description: 'Head and face dominate the image; shoulders may be partially visible.',
    aliases: ['cu', 'head-only', 'headshot']
  },
  {
    id: 'medium_close_up',
    code: 'MCU',
    label: 'MCU — Medium Close-Up',
    shortDescription: 'Head and shoulders',
    description: 'Head and shoulders, typically cropped around the upper chest.',
    aliases: ['mcu']
  },
  {
    id: 'bust_shot',
    code: 'BUST',
    label: 'BUST — Bust Shot',
    shortDescription: 'Chest up, upper torso',
    description: 'Head, shoulders, and upper torso, usually ending around the chest.',
    aliases: ['bust', 'chest-up']
  },
  {
    id: 'medium_shot',
    code: 'MS',
    label: 'MS — Medium Shot',
    shortDescription: 'Head to waist',
    description: 'Head to waist; hands and waist-level props can be visible.',
    aliases: ['ms', 'waist-up', 'half-body']
  },
  {
    id: 'medium_long_shot',
    code: 'MLS',
    label: 'MLS — Medium-Long Shot',
    shortDescription: 'Head to mid-thigh',
    description: 'Head to mid-thigh; shows more clothing and body language.',
    aliases: ['mls']
  },
  {
    id: 'three_quarter_shot',
    code: '3/4',
    label: '3/4 — Three-Quarter Shot',
    shortDescription: 'Head to knees or lower legs',
    description: 'Head to knees or lower legs, depending on the specified crop.',
    aliases: ['three_quarter', '3-4', 'three-quarter']
  },
  {
    id: 'american_shot',
    code: 'AS',
    label: 'AS — American Shot',
    shortDescription: 'Head to mid-thigh (holster crop)',
    description: 'Head to mid-thigh, traditionally used to show holstered weapons and posture.',
    aliases: ['as', 'cowboy_shot', 'cowboy-shot']
  },
  {
    id: 'full_shot',
    code: 'FS',
    label: 'FS — Full Shot',
    shortDescription: 'Head to feet, fills frame',
    description: 'Entire character from head to feet, filling most of the vertical frame.',
    aliases: ['fs', 'full-body', 'full_body']
  },
  {
    id: 'long_shot',
    code: 'LS',
    label: 'LS — Long Shot',
    shortDescription: 'Character with surrounding space',
    description: 'Entire character appears smaller, with generous surrounding space.',
    aliases: ['ls']
  },
  {
    id: 'extreme_long_shot',
    code: 'ELS',
    label: 'ELS — Extreme Long Shot',
    shortDescription: 'Environment dominates',
    description: 'Character occupies a small part of the image; environment dominates.',
    aliases: ['els']
  },
  {
    id: 'very_wide_shot',
    code: 'VWS',
    label: 'VWS — Very Wide Shot',
    shortDescription: 'Distant scale in broad setting',
    description: 'Character shown at a distance within a broad setting; often used for establishing scale.',
    aliases: ['vws']
  }
];

export const normalizeFramingId = (val?: string | null): string => {
  if (!val) return 'full_shot';
  const clean = val.toLowerCase().trim();
  for (const preset of SHOT_DISTANCE_PRESETS) {
    if (preset.id === clean || preset.code.toLowerCase() === clean) return preset.id;
    if (preset.aliases?.some(a => a.toLowerCase() === clean)) return preset.id;
  }
  return clean;
};

export const getShotDistancePreset = (val?: string | null): ShotDistancePreset | undefined => {
  const norm = normalizeFramingId(val);
  return SHOT_DISTANCE_PRESETS.find(p => p.id === norm);
};
