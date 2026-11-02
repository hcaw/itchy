// The openDAW symbols Itchy uses, and nothing else. scripts/vendor-opendaw.mjs bundles this file into
// vendor/opendaw/<sdk version>/opendaw.js. Add a name here (and re-run `npm run vendor:opendaw`) before using it.
export { UUID, Option, DefaultObservableValue } from '@opendaw/lib-std';
export { SamplePeaks } from '@opendaw/lib-fusion';
export { PPQN, AudioData } from '@opendaw/lib-dsp';
export { AnimationFrame } from '@opendaw/lib-dom';
export { InstrumentFactories, NoteSignal, AudioBusFactory, BpmDetector } from '@opendaw/studio-adapters';
export { AudioFileBox, AuxSendBox, ZeitgeistDeviceBox, PlayfieldSampleBox } from '@opendaw/studio-boxes';
export { AudioUnitType, IconSymbol, AudioSendRouting, Colors } from '@opendaw/studio-enums';
export {
  Project, Workers, AudioWorklets, SampleService, EffectFactories, OfflineEngineRenderer, DefaultSampleLoader,
} from '@opendaw/studio-core';
export { WasmEngine } from '@opendaw/studio-core-wasm';
export { OPENDAW_SDK_VERSION } from '@opendaw/studio-sdk';
