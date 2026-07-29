/**
 * Type definitions for the label engine
 */

export interface LabelData {
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
  sweetness: string;
  wineType: string;
  wineColorName: string;
  wineColor: string;
}

export interface RenderOptions {
  widthMM: number;
  heightMM: number;
  seed: number;
  placeholderImage?: string;
  generatedImage?: string | null;
}

export interface LabelOption {
  name: string;
  rank: string;
  style: string;
  desc: string;
  svg: string;
}

export interface StyleListEntry {
  key: string;
  name: string;
}

export type FieldOrder = (
  | "producer"
  | "wineName"
  | "appellation"
  | "grape"
  | "vintage"
  | "classification"
  | "regionCountry"
  | "special"
  | "attributes"
  | "alcVol"
)[];
