import type { ID, StarterTemplate } from '../../types';
import { fullBodyFoundations } from './fullBodyFoundations';
import { dumbbellFullBody } from './dumbbellFullBody';
import { bodyweightStarter } from './bodyweightStarter';
import { barbellStrengthBase } from './barbellStrengthBase';
import { fullRangeStrength } from './fullRangeStrength';
import { upperLowerBuilder } from './upperLowerBuilder';
import { fiveDayMuscle } from './fiveDayMuscle';
import { bigThreeBlock } from './bigThreeBlock';
import { calisthenicsStrength } from './calisthenicsStrength';
import { strengthCircuits } from './strengthCircuits';
import { athleticBase } from './athleticBase';
import { pushPullLegs } from './pushPullLegs';

/**
 * The starter catalog (G3.13), in catalog order: the order of the Templates list and the last
 * tie-break in onboarding's picks. Beginner-suitable programs come first.
 */
export const STARTER_TEMPLATES: StarterTemplate[] = [
  fullBodyFoundations,
  dumbbellFullBody,
  bodyweightStarter,
  barbellStrengthBase,
  fullRangeStrength,
  upperLowerBuilder,
  fiveDayMuscle,
  bigThreeBlock,
  calisthenicsStrength,
  strengthCircuits,
  athleticBase,
  pushPullLegs,
];

/**
 * Ids of the stand-in templates retired with the real catalog. Never reuse one: plans copied
 * from them keep the id, and their "From the ... template" line just drops. tpl_upper_lower and
 * tpl_ppl were kept for the new programs of the same kind.
 */
export const RETIRED_TEMPLATE_IDS: readonly ID[] = ['tpl_powerbuilding', 'tpl_calisthenics', 'tpl_atg', 'tpl_conditioning', 'tpl_athlete'];
