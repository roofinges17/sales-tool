export const PITCH_MULTIPLIERS: Record<string, number> = {
  "FLAT":  1.000,
  "0:12":  1.000,
  "2:12":  1.014,
  "3:12":  1.031,
  "4:12":  1.054,
  "5:12":  1.083,
  "6:12":  1.118,
  "7:12":  1.158,
  "8:12":  1.202,
  "9:12":  1.250,
  "10:12": 1.302,
  "11:12": 1.357,
  "12:12": 1.414,
};

export const PITCH_OPTIONS = [
  { value: "2:12",  label: "2:12" },
  { value: "3:12",  label: "3:12" },
  { value: "4:12",  label: "4:12" },
  { value: "5:12",  label: "5:12" },
  { value: "6:12",  label: "6:12" },
  { value: "7:12",  label: "7:12" },
  { value: "8:12",  label: "8:12" },
  { value: "9:12",  label: "9:12" },
  { value: "10:12", label: "10:12" },
  { value: "11:12", label: "11:12" },
  { value: "12:12", label: "12:12" },
];

export function pitchMultiplier(pitch: string): number {
  return PITCH_MULTIPLIERS[pitch] ?? 1.0;
}
