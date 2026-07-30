import type { Theme } from '../types'
import { kubestellar } from './kubestellar'

export const kubestellarClassic: Theme = {
  id: 'kubestellar-classic',
  name: 'KubeStellar Classic',
  description: 'Original space-inspired theme with glow and star effects',
  dark: true,
  starField: true,
  glowEffects: true,
  gradientAccents: true,
  colors: {
    ...kubestellar.colors,
    glassShadow: 'rgba(147, 51, 234, 0.2)',
    scrollbarThumb: 'rgba(147, 51, 234, 0.3)',
    scrollbarThumbHover: 'rgba(147, 51, 234, 0.5)',
  },
  font: kubestellar.font,
}
