export const PREDICTION_THEME_NAMES: readonly string[];

export function pickPredictionCards<
  T extends { id: string; topic: string },
>(
  cards: T[],
  options?: {
    random?: () => number;
    previousIds?: string[];
  },
): T[];

export function shouldAutoOpenReflection(options: {
  challengeComplete: boolean;
  observationCompleted: boolean;
  reflectionShown: boolean;
}): boolean;
