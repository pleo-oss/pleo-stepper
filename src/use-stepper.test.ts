import {renderHook} from '@testing-library/react-hooks'

import {calculateFirstStep, generateArrayFromTree, Steps, useStepper} from './use-stepper'

type AllowedStepNames = '1' | '2' | '3'
const mockSimpleSteps: Steps<AllowedStepNames> = {
    initialStep: '1',
    '1': {
        next: '2'
    },
    '2': {
        next: '3',
        canGoBack: false
    },
    '3': {
        next: null
    }
}

const nestedLayer: Steps<'2.1.1' | '2.1.2' | '2.1.3'> = {
    initialStep: '2.1.1',
    '2.1.1': {
        canGoBack: false,
        next: '2.1.2'
    },
    '2.1.2': {
        shouldSkip: async () => true,
        next: '2.1.3'
    },
    '2.1.3': {
        next: null
    }
}

const mockAdvancedSteps: Steps<AllowedStepNames> = {
    initialStep: '1',
    '1': {
        next: '2',
        isDone: () => true
    },
    '2': {
        next: '3',
        isDone: async () => {
            const sleep = () => new Promise((resolve) => setTimeout(resolve, 1))
            await sleep()
            return false
        },
        childSteps: {
            initialStep: '2.1',
            '2.1': {
                next: '2.2',
                childSteps: nestedLayer
            },
            '2.2': {
                next: null,
                childSteps: {
                    initialStep: '2.2.1',
                    '2.2.1': {
                        next: '2.2.2'
                    },
                    '2.2.2': {
                        next: null
                    }
                }
            }
        }
    },
    '3': {
        next: null
    }
}

describe('calculateFirstStep', () => {
    it('should return an initial step if no steps are done', () => {
        return calculateFirstStep(mockSimpleSteps).then((result) => {
            expect(result).toEqual('1')
        })
    })
    it('should return a step that is not done', () => {
        return calculateFirstStep(mockAdvancedSteps).then((result) => {
            expect(result).toEqual('2/2.1/2.1.1')
        })
    })

    it('should return a step that is done if its "next" prop is null', () => {
        const theSteps: Steps<'first'> = {
            initialStep: 'first',
            first: {
                next: null,
                isDone: () => true
            }
        }
        return calculateFirstStep(theSteps).then((result) => {
            expect(result).toEqual('first')
        })
    })
    test('isDone should have priority over initialStep', () => {
        // even tho we specify "first", it is Done, so stepper must skip it
        // and pick one of the next.
        return calculateFirstStep(mockAdvancedSteps, '1').then((result) => {
            expect(result).toEqual('2/2.1/2.1.1')
        })
    })
})

describe('generateArrayFromTree', () => {
    it('should create a plain array from plain steps', () => {
        expect(generateArrayFromTree(mockSimpleSteps)).toEqual([
            {
                address: '1',
                canGoBack: false
            },
            {
                address: '2',
                canGoBack: false
            },
            {
                address: '3',
                canGoBack: true
            }
        ])
    })
    it('should create a plain array from nested steps', () => {
        expect(JSON.stringify(generateArrayFromTree(mockAdvancedSteps))).toEqual(
            JSON.stringify([
                {
                    address: '1',
                    canGoBack: false
                },
                {
                    address: '2/2.1/2.1.1',
                    canGoBack: false
                },
                {
                    address: '2/2.1/2.1.2',
                    canGoBack: true,
                    shouldSkip: async () => true
                },
                {
                    address: '2/2.1/2.1.3',
                    canGoBack: true
                },
                {
                    address: '2/2.2/2.2.1',
                    canGoBack: true
                },
                {
                    address: '2/2.2/2.2.2',
                    canGoBack: true
                },
                {
                    address: '3',
                    canGoBack: true
                }
            ])
        )
    })
})

describe('useStepper', () => {
    it('should return CURRENT step', async () => {
        const {result, waitForNextUpdate} = renderHook(() => useStepper(mockSimpleSteps))
        expect(result.current.isLoading).toBe(true)
        await waitForNextUpdate() // wait for stepper to init
        expect(result.current.currentStep?.address).toEqual('1')
    })

    it('should go to NEXT step in a flat steps structure', async () => {
        const {result, waitForNextUpdate} = renderHook(() => useStepper(mockSimpleSteps))
        await waitForNextUpdate() // wait for stepper to init
        expect(result.current.currentStep?.address).toEqual('1')

        result.current.goToNextStep()
        await waitForNextUpdate()
        expect(result.current.currentStep?.address).toEqual('2')

        result.current.goToNextStep()
        await waitForNextUpdate()
        expect(result.current.currentStep?.address).toEqual('3')
    })

    it('should not break when there is no NEXT step', async () => {
        const {result, waitForNextUpdate} = renderHook(() => useStepper(mockSimpleSteps, '3'))
        await waitForNextUpdate() // wait for stepper to init
        expect(result.current.currentStep?.address).toEqual('3')

        result.current.goToNextStep()
        result.current.goToNextStep()
        expect(result.current.currentStep?.address).toEqual('3')
    })

    it('should go to NEXT step in a nested steps structure', async () => {
        const {result, waitForNextUpdate} = renderHook(() => useStepper(mockAdvancedSteps))
        await waitForNextUpdate() // wait for stepper to init
        expect(result.current.currentStep?.address).toEqual('2/2.1/2.1.1')

        result.current.goToNextStep()
        await waitForNextUpdate()
        expect(result.current.currentStep?.address).toEqual('2/2.1/2.1.3')

        result.current.goToNextStep()
        await waitForNextUpdate()
        expect(result.current.currentStep?.address).toEqual('2/2.2/2.2.1')

        result.current.goToNextStep()
        await waitForNextUpdate()
        expect(result.current.currentStep?.address).toEqual('2/2.2/2.2.2')

        result.current.goToNextStep()
        await waitForNextUpdate()
        expect(result.current.currentStep?.address).toEqual('3')
    })

    it('should go to PREV step in a flat steps structure', async () => {
        const {result, waitForNextUpdate} = renderHook(() => useStepper(mockSimpleSteps, '3'))
        await waitForNextUpdate() // wait for stepper to init
        expect(result.current.currentStep?.address).toEqual('3')

        result.current.goToPrevStep()
        await waitForNextUpdate()
        expect(result.current.currentStep?.address).toEqual('2')
    })
    it('should NOT go to PREV step if current canGoBack is false', async () => {
        const {result, waitForNextUpdate} = renderHook(() => useStepper(mockSimpleSteps, '2'))
        await waitForNextUpdate() // wait for stepper to init
        expect(result.current.currentStep.canGoBack).toBe(false)
        result.current.goToPrevStep()
        expect(result.current.currentStep?.address).toEqual('2')
    })
    it('should not break when there is no PREV step', async () => {
        const {result, waitForNextUpdate} = renderHook(() => useStepper(mockSimpleSteps, '1'))
        await waitForNextUpdate() // wait for stepper to init
        expect(result.current.currentStep?.address).toEqual('1')

        result.current.goToPrevStep()
        result.current.goToPrevStep()
        expect(result.current.currentStep?.address).toEqual('1')
    })
    it('should go to PREV step in a nested steps structure', async () => {
        const {result, waitForNextUpdate} = renderHook(() => useStepper(mockAdvancedSteps, '3'))
        await waitForNextUpdate() // wait for stepper to init
        expect(result.current.currentStep?.address).toEqual('3')

        result.current.goToPrevStep()
        await waitForNextUpdate()
        expect(result.current.currentStep?.address).toEqual('2/2.2/2.2.2')

        result.current.goToPrevStep()
        await waitForNextUpdate()
        expect(result.current.currentStep?.address).toEqual('2/2.2/2.2.1')

        result.current.goToPrevStep()
        await waitForNextUpdate()
        expect(result.current.currentStep?.address).toEqual('2/2.1/2.1.3')

        result.current.goToPrevStep()
        await waitForNextUpdate()
        expect(result.current.currentStep?.address).toEqual('2/2.1/2.1.1')
        expect(result.current.currentStep.canGoBack).toBe(false)
    })

    it('should skip steps when their shouldSkip returns true', async () => {
        const steps: Steps = {
            initialStep: '1',
            '1': {
                next: '2'
            },
            '2': {
                next: '3',
                shouldSkip: () => true
            },
            '3': {
                next: null
            }
        }

        const {result, waitForNextUpdate} = renderHook(() => useStepper(steps))
        await waitForNextUpdate() // wait for stepper to init
        expect(result.current.currentStep?.address).toEqual('1')

        result.current.goToNextStep()
        await waitForNextUpdate()
        expect(result.current.currentStep?.address).toEqual('3')

        result.current.goToPrevStep()
        await waitForNextUpdate()
        expect(result.current.currentStep?.address).toEqual('1')
    })
})
