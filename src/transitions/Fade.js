import { Transition } from '@unseenco/taxi'
import { animate } from 'motion'
import settings from '../settings.json'

//Placeholder page transition until the real one is designed
export default class Fade extends Transition {
    onLeave({ from, done }) {
        const { duration, ease } = settings.transition
        animate(from, { opacity: 0 }, { duration, ease }).then(done)
    }

    onEnter({ to, done }) {
        const { duration, ease } = settings.transition
        animate(to, { opacity: [0, 1] }, { duration, ease }).then(done)
    }
}
