import type { MotionVariants } from "@vueuse/motion";

const spring = {
  type: "spring" as const,
  stiffness: 320,
  damping: 30,
  mass: 0.82,
};

export const splitPanelMotion: MotionVariants<string> = {
  initial: { opacity: 0, x: 22, y: 14 },
  enter: { opacity: 1, x: 0, y: 0, transition: spring },
  leave: {
    opacity: 0,
    x: 18,
    y: 18,
    transition: { type: "tween", duration: 180, ease: [0.4, 0, 1, 1] },
  },
};

export const bottomSheetMotion: MotionVariants<string> = {
  initial: { opacity: 0, y: 72 },
  enter: { opacity: 1, y: 0, transition: spring },
  leave: {
    opacity: 0,
    y: 72,
    transition: { type: "tween", duration: 180, ease: [0.4, 0, 1, 1] },
  },
};
