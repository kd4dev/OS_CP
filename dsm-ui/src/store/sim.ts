import { create } from 'zustand';
import { FlashingCell, LinkPulse, MsiState, StepEvent } from '../lib/types';

export type ViewType = 'overview' | 'coherence' | 'sync';

interface SimStore {
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;

  targetPageId: number;
  targetAddr: string;
  setTargetPage: (pageId: number, addr?: string) => void;

  nodeMsiStates: Record<number, MsiState>;
  setNodeMsiStates: (states: Record<number, MsiState> | ((prev: Record<number, MsiState>) => Record<number, MsiState>)) => void;

  activeLinkPulse: LinkPulse;
  fireLinkPulse: (nodes: number[], color: string, label: string, durationMs?: number) => void;
  clearLinkPulse: () => void;

  flashingCell: FlashingCell | null;
  triggerCellFlash: (row: number, col: number, val: string, type: 'write' | 'read') => void;
  clearCellFlash: () => void;

  simState: 'running' | 'paused' | 'stopped';
  setSimState: (state: 'running' | 'paused' | 'stopped') => void;

  // Step / Packet-Tracer simulation mode
  stepMode: boolean;
  setStepMode: (enabled: boolean) => void;
  toggleStepMode: () => void;

  stepScenarioType: 'write' | 'read';
  setStepScenarioType: (type: 'write' | 'read') => void;

  currentStep: number;
  setCurrentStep: (step: number | ((prev: number) => number)) => void;

  isAutoPlaying: boolean;
  setIsAutoPlaying: (playing: boolean) => void;

  stepEvents: StepEvent[];
  addStepEvent: (event: Omit<StepEvent, 'id' | 'time'>) => void;
  clearStepEvents: () => void;

  scenarioBanner: string;
  setScenarioBanner: (banner: string) => void;

  activeScenario: string;
  setActiveScenario: (scenario: string) => void;

  // Theme
  theme: 'dark' | 'light';
  toggleTheme: () => void;
}

let pulseTimer: any = null;
let flashTimer: any = null;

export const useSimStore = create<SimStore>((set, get) => ({
  activeView: 'overview',
  setActiveView: (view) => {
    set({ activeView: view });
    window.location.hash = `#/${view}`;
  },

  targetPageId: 1,
  targetAddr: '0x1A3F',
  setTargetPage: (pageId, addr) => {
    const defaultAddr = `0x${(pageId * 0x1000).toString(16).toUpperCase().padStart(4, '0')}`;
    set({
      targetPageId: pageId,
      targetAddr: addr || defaultAddr,
    });
  },

  nodeMsiStates: {
    1: 'Shared',
    2: 'Shared',
    3: 'Invalid',
    4: 'Invalid',
  },
  setNodeMsiStates: (updater) => {
    set((state) => ({
      nodeMsiStates: typeof updater === 'function' ? updater(state.nodeMsiStates) : updater,
    }));
  },

  activeLinkPulse: {
    n1: false,
    n2: false,
    n3: false,
    n4: false,
    color: '#5BA4F5',
    label: '',
  },
  fireLinkPulse: (nodes, color, label, durationMs = 2200) => {
    if (pulseTimer) clearTimeout(pulseTimer);
    set({
      activeLinkPulse: {
        n1: nodes.includes(1),
        n2: nodes.includes(2),
        n3: nodes.includes(3),
        n4: nodes.includes(4),
        color,
        label,
      },
    });
    pulseTimer = setTimeout(() => {
      set({
        activeLinkPulse: { n1: false, n2: false, n3: false, n4: false, color: '#5BA4F5', label: '' },
      });
    }, durationMs);
  },
  clearLinkPulse: () => {
    if (pulseTimer) clearTimeout(pulseTimer);
    set({
      activeLinkPulse: { n1: false, n2: false, n3: false, n4: false, color: '#5BA4F5', label: '' },
    });
  },

  flashingCell: null,
  triggerCellFlash: (row, col, val, type) => {
    if (flashTimer) clearTimeout(flashTimer);
    set({
      flashingCell: { row, col, val, type, timestamp: Date.now() },
    });
    flashTimer = setTimeout(() => {
      set({ flashingCell: null });
    }, 1200);
  },
  clearCellFlash: () => {
    if (flashTimer) clearTimeout(flashTimer);
    set({ flashingCell: null });
  },

  simState: 'running',
  setSimState: (state) => set({ simState: state }),

  stepMode: false,
  setStepMode: (enabled) => set({ stepMode: enabled }),
  toggleStepMode: () => set((state) => ({ stepMode: !state.stepMode })),

  stepScenarioType: 'write',
  setStepScenarioType: (type) => set({ stepScenarioType: type, currentStep: 0 }),

  currentStep: 0,
  setCurrentStep: (step) =>
    set((state) => ({
      currentStep: typeof step === 'function' ? step(state.currentStep) : step,
    })),

  isAutoPlaying: false,
  setIsAutoPlaying: (playing) => set({ isAutoPlaying: playing }),

  stepEvents: [],
  addStepEvent: (event) => {
    const time = new Date().toTimeString().split(' ')[0];
    set((state) => ({
      stepEvents: [
        ...state.stepEvents,
        {
          id: state.stepEvents.length + 1,
          time,
          ...event,
        },
      ],
    }));
  },
  clearStepEvents: () => set({ stepEvents: [] }),

  scenarioBanner: '',
  setScenarioBanner: (banner) => set({ scenarioBanner: banner }),

  activeScenario: '',
  setActiveScenario: (scenario) => set({ activeScenario: scenario }),

  theme: (typeof window !== 'undefined' && (localStorage.getItem('dsm-theme') as 'dark' | 'light')) || 'dark',
  toggleTheme: () => {
    set((state) => {
      const next = state.theme === 'dark' ? 'light' : 'dark';
      if (typeof window !== 'undefined') {
        localStorage.setItem('dsm-theme', next);
        if (next === 'light') {
          document.documentElement.classList.remove('dark');
          document.documentElement.classList.add('light');
        } else {
          document.documentElement.classList.remove('light');
          document.documentElement.classList.add('dark');
        }
      }
      return { theme: next };
    });
  },
}));
