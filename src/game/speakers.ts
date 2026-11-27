export type Speaker = { id:string; name:string; price:number; power:number; placement:'desktop'|'floor'; color:string; height:number; drivers:number; amplifier:boolean };
/** Volume differs by equipment. SoundCloud's iframe does not expose audio for equalization. */
export const SPEAKERS:Speaker[] = [
  {id:'speaker_1',name:'LS Mini',price:1000,power:.7,placement:'desktop',color:'#252932',height:.22,drivers:1,amplifier:false},
  {id:'speaker_2',name:'LS Compact',price:2000,power:.7,placement:'desktop',color:'#e5e7eb',height:.25,drivers:1,amplifier:false},
  {id:'speaker_3',name:'LS Stereo',price:4000,power:.7,placement:'desktop',color:'#654639',height:.27,drivers:2,amplifier:false},
  {id:'speaker_4',name:'LS Pulse',price:6500,power:.7,placement:'desktop',color:'#31345c',height:.30,drivers:2,amplifier:false},
  {id:'speaker_5',name:'LS Wave',price:10000,power:1,placement:'floor',color:'#364658',height:.55,drivers:1,amplifier:true},
  {id:'speaker_6',name:'LS Studio',price:15000,power:1,placement:'floor',color:'#ede9e0',height:.65,drivers:2,amplifier:true},
  {id:'speaker_7',name:'LS Bass',price:22000,power:1,placement:'floor',color:'#7a4a28',height:.72,drivers:2,amplifier:true},
  {id:'speaker_8',name:'LS Pro',price:30000,power:1,placement:'floor',color:'#17242f',height:.80,drivers:2,amplifier:true},
  {id:'speaker_9',name:'LS Ultra',price:40000,power:1,placement:'floor',color:'#343a4c',height:.88,drivers:3,amplifier:true},
  {id:'speaker_10',name:'LS Grand',price:50000,power:1,placement:'floor',color:'#1b1b20',height:.98,drivers:3,amplifier:true},
];
export function speakerById(id:unknown):Speaker|undefined {return typeof id==='string'?SPEAKERS.find(s=>s.id===id):undefined;}
export function speakerVolume(volume:number,id:unknown):number {return Number.isFinite(volume)?Math.max(0,Math.min(1,volume))*(speakerById(id)?.power ?? .7):0;}
