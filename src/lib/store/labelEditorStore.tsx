'use client';

import React, { createContext, useContext, useReducer, ReactNode } from 'react';

export interface EditorState {
  tab: 'front' | 'back' | 'bottle';
  visionText: string;
  sketchFile: File | null;
  orientation: 'h' | 'v';
  widthMM: number;
  heightMM: number;
  wineType: string;
  wineColor: string;
  wineColorName: string;
  sweetness: string;

  // Front label fields
  producer: string;
  wine: string;
  appellation: string;
  classification: string;
  grape: string;
  region: string;
  country: string;
  special: string;
  vintage: string;
  alcohol: string;
  volume: string;

  // Generated label image (from AI)
  labelImage: string | null;
  referenceImage: string | null;

  // Gallery / preview state
  selectedStyleIndex: number;
  galleryOpen: boolean;

  // Loading state
  isGenerating: boolean;
}

const initialState: EditorState = {
  tab: 'front',
  visionText: '',
  sketchFile: null,
  orientation: 'h',
  widthMM: 110,
  heightMM: 80,
  wineType: 'Still Wine',
  wineColor: '#6E1423',
  wineColorName: 'Red',
  sweetness: 'Dry',
  producer: '',
  wine: '',
  appellation: '',
  classification: '',
  grape: '',
  region: '',
  country: '',
  special: '',
  vintage: '',
  alcohol: '',
  volume: '',
  labelImage: null,
  referenceImage: null,
  selectedStyleIndex: 0,
  galleryOpen: false,
  isGenerating: false,
};

export type EditorAction =
  | { type: 'SET_TAB'; payload: EditorState['tab'] }
  | { type: 'SET_VISION'; payload: string }
  | { type: 'SET_SKETCH_FILE'; payload: File | null }
  | { type: 'SET_ORIENTATION'; payload: 'h' | 'v' }
  | { type: 'SET_DIMENSIONS'; payload: { width: number; height: number } }
  | { type: 'SET_WINE_TYPE'; payload: string }
  | { type: 'SET_WINE_COLOR'; payload: { color: string; name: string } }
  | { type: 'SET_SWEETNESS'; payload: string }
  | { type: 'SET_FIELD'; payload: { field: keyof EditorState; value: string } }
  | { type: 'SET_LABEL_IMAGE'; payload: string | null }
  | { type: 'SET_REFERENCE_IMAGE'; payload: string | null }
  | { type: 'SET_SELECTED_STYLE'; payload: number }
  | { type: 'SET_GALLERY_OPEN'; payload: boolean }
  | { type: 'SET_GENERATING'; payload: boolean }
  | { type: 'RESET' };

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'SET_TAB':
      return { ...state, tab: action.payload };
    case 'SET_VISION':
      return { ...state, visionText: action.payload };
    case 'SET_SKETCH_FILE':
      return { ...state, sketchFile: action.payload };
    case 'SET_ORIENTATION':
      return { ...state, orientation: action.payload };
    case 'SET_DIMENSIONS':
      return { ...state, widthMM: action.payload.width, heightMM: action.payload.height };
    case 'SET_WINE_TYPE':
      return { ...state, wineType: action.payload };
    case 'SET_WINE_COLOR':
      return { ...state, wineColor: action.payload.color, wineColorName: action.payload.name };
    case 'SET_SWEETNESS':
      return { ...state, sweetness: action.payload };
    case 'SET_FIELD':
      return { ...state, [action.payload.field]: action.payload.value };
    case 'SET_LABEL_IMAGE':
      return { ...state, labelImage: action.payload };
    case 'SET_REFERENCE_IMAGE':
      return { ...state, referenceImage: action.payload };
    case 'SET_SELECTED_STYLE':
      return { ...state, selectedStyleIndex: action.payload };
    case 'SET_GALLERY_OPEN':
      return { ...state, galleryOpen: action.payload };
    case 'SET_GENERATING':
      return { ...state, isGenerating: action.payload };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

interface LabelEditorContextType {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
}

const LabelEditorContext = createContext<LabelEditorContextType | undefined>(undefined);

export function LabelEditorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(editorReducer, initialState);

  return (
    <LabelEditorContext.Provider value={{ state, dispatch }}>
      {children}
    </LabelEditorContext.Provider>
  );
}

export function useLabelEditor() {
  const context = useContext(LabelEditorContext);
  if (!context) {
    throw new Error('useLabelEditor must be used within LabelEditorProvider');
  }
  return context;
}
