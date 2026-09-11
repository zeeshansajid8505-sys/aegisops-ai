'use client';

import { Variants } from 'framer-motion';

/**
 * Phase 6 Centralized Motion Design System
 * Restrained, enterprise-grade, tactile interactions with zero decorative bouncing.
 */
export const MOTION_TOKENS = {
  durations: {
    fast: 0.15,
    standard: 0.2,
    slow: 0.3,
  },
  easings: {
    easeOut: [0.16, 1, 0.3, 1] as const, // Smooth deceleration
    easeIn: [0.7, 0, 0.84, 0] as const,
    easeInOut: [0.65, 0, 0.35, 1] as const,
  },
} as const;

export const pageTransitionVariants: Variants = {
  initial: {
    opacity: 0,
    y: 6,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: MOTION_TOKENS.durations.standard,
      ease: MOTION_TOKENS.easings.easeOut,
    },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: {
      duration: MOTION_TOKENS.durations.fast,
      ease: MOTION_TOKENS.easings.easeIn,
    },
  },
};

export const staggerContainerVariants: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.03,
      delayChildren: 0.02,
    },
  },
};

export const staggerItemVariants: Variants = {
  initial: {
    opacity: 0,
    y: 4,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: MOTION_TOKENS.durations.standard,
      ease: MOTION_TOKENS.easings.easeOut,
    },
  },
};

export const modalVariants: Variants = {
  initial: {
    opacity: 0,
    scale: 0.97,
    y: 6,
  },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: MOTION_TOKENS.durations.standard,
      ease: MOTION_TOKENS.easings.easeOut,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: 4,
    transition: {
      duration: MOTION_TOKENS.durations.fast,
      ease: MOTION_TOKENS.easings.easeIn,
    },
  },
};

export const drawerVariants: Variants = {
  initial: {
    x: '100%',
    opacity: 0.5,
  },
  animate: {
    x: 0,
    opacity: 1,
    transition: {
      duration: MOTION_TOKENS.durations.slow,
      ease: MOTION_TOKENS.easings.easeOut,
    },
  },
  exit: {
    x: '100%',
    opacity: 0,
    transition: {
      duration: MOTION_TOKENS.durations.standard,
      ease: MOTION_TOKENS.easings.easeIn,
    },
  },
};

export const tactileButtonProps = {
  whileTap: { scale: 0.98 },
  transition: { duration: MOTION_TOKENS.durations.fast },
};

