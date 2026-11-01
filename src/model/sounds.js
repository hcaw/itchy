// Sound catalogue (metadata only: the audio lives in src/audio/instruments.js).
// kind 'beat' → rows are kit pieces; kind 'tune' → rows are scale notes.

export const BEAT_ROWS = 4;
export const TUNE_ROWS = 8;

export const SOUNDS = {
  kit:     { kind: 'beat', label: 'Boom drums',  shape: 'drum' },
  tinykit: { kind: 'beat', label: 'Tiny drums',  shape: 'robot' },
  bells:   { kind: 'tune', label: 'Bells',       shape: 'bell',   base: 72 },
  pluck:   { kind: 'tune', label: 'Pluck',       shape: 'star',   base: 60 },
  bass:    { kind: 'tune', label: 'Bass',        shape: 'blob',   base: 36 },
  cloud:   { kind: 'tune', label: 'Cloud',       shape: 'cloud',  base: 60 },
  // Recorded sounds use the id 'rec:<sampleId>' and are always tune sounds.
};
export const BEAT_SOUNDS = ['kit', 'tinykit'];
export const TUNE_SOUNDS = ['bells', 'pluck', 'bass', 'cloud'];

/** Drum rows, bottom to top. */
export const KIT_PIECES = [
  { id: 'kick',  label: 'Kick' },
  { id: 'snare', label: 'Snare' },
  { id: 'clap',  label: 'Clap' },
  { id: 'hat',   label: 'Hi-hat' },
];

export function isRecording(sound) {
  return typeof sound === 'string' && sound.startsWith('rec:');
}
export function recordingId(sound) {
  return isRecording(sound) ? sound.slice(4) : null;
}
export function soundInfo(sound) {
  if (isRecording(sound)) return { kind: 'tune', label: 'My sound', shape: 'mic', base: 60 };
  return SOUNDS[sound] || SOUNDS.bells;
}
export function soundKind(sound) {
  return soundInfo(sound).kind;
}
export function rowsForSound(sound) {
  return soundKind(sound) === 'beat' ? BEAT_ROWS : TUNE_ROWS;
}

/** Layer colours: bright, friendly, and each paired with a different critter shape/eyes. */
export const COLORS = ['#ff6b6b', '#4dabf7', '#ffd43b', '#69db7c', '#b197fc', '#ff922b', '#f783ac', '#3bc9db'];
