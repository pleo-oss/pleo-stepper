/**
 * The hook serves state handling for Form wizards a.k.a. Steppers.
 *
 * This is a small implementation doc. There are 2 main functions:
 *
 * 1. Initial step calculation (for a page load).
 * 2. Navigating back and forth
 *
 * Stepper's source of truth is a nested data structure (binary tree).
 * It is used for (1) so that we can have one check for the whole subtree (e.g. hasUser() for the whole set of User register steps).
 * For (2) we traverse the tree on the initial load (see below) and generate a plain array of nodes.
 *
 * Generating the plain array from the tree.
 * Consider a stepper looking like this:
 * 1
 * 2
 * |- 2.1
 * |- 2.2
 *    |- 2.2.1
 * 3
 * |- 3.1
 *    |- 3.1.1
 *    |- 3.1.2
 * |- 3.2
 * 4
 *
 * If you squint you'll see a binary tree. To turn it into a structure that's easy to navigate,
 * we want to traverse it in preorder NLR fashion (node, left, right),
 * where left is "childSteps" subtree and right is "next" subtree.
 *
 * Rotating the graph to correspond to "left" and "right" fashion:
 *       1
 *        \
 *          2
 *       __/ \___________
 *      /                3
 *    2.1               / \__
 *      \             3.1    4
 *       2.2         /   \
 *       /       3.1.1    3.2
 *   2.2.1           \
 *                    3.1.2
 *
 * Traversing the tree will generate an array that looks like [1, 2, 2.1, 2.2, 2.2.1, 3, etc] where it's easy to go back and forth.
 */

import {useEffect, useState} from 'react'

export type Steps<AllowedStepName extends string = string> = {
    initialStep: AllowedStepName
} & {
    [K in AllowedStepName]?: Step<AllowedStepName> | AllowedStepName
}

export type Step<AllowedStepName extends string = string> = {
    next: AllowedStepName | null
    isDone?: () => Promise<boolean> | boolean //defaults to false
    canGoBack?: boolean // defaults to true`
    childSteps?: Steps<string>
    shouldSkip?: () => Promise<boolean> | boolean // defaults to false
}

const NAME_ADDRESS_DELIMITER = '/'

/**
 * returns first unfulfilled step
 * @param steps
 * @param initialStep the step to start the search from
 * @returns Promise of a step address string
 */
export const calculateFirstStep = async <StepName extends string>(
    steps: Steps<StepName>,
    initialStep = steps.initialStep as StepName
): Promise<string> => {
    const {childSteps, next, isDone, shouldSkip} = steps[initialStep] as Step<StepName>
    const stepName = initialStep
    const isStepDone = isDone ? await isDone() : false
    const shouldSkipStep = shouldSkip ? await shouldSkip() : false
    if (isStepDone || shouldSkipStep) {
        //move on to next screen
        // if no next, we must be in the end, so return this one.
        return next ? calculateFirstStep(steps, next) : stepName
    }
    // step is not done, stay here.
    return childSteps
        ? `${stepName}${NAME_ADDRESS_DELIMITER}${await calculateFirstStep(childSteps)}`
        : stepName
}

type SequentialStep = {
    address: string
    canGoBack: boolean
    shouldSkip?: () => boolean | Promise<boolean>
}

export function generateArrayFromTree(steps: Steps): SequentialStep[] {
    const result: SequentialStep[] = []
    function recurTraverse(stepName: string, subtree: Steps, addressCollector = '') {
        const step = subtree[stepName] as Step
        // base case
        if (!step) {
            return
        }
        const {childSteps, next, canGoBack, shouldSkip} = step
        const defaultCanGoBack = result.length ? true : false
        // 1. save node
        // ignore "container" steps with childSteps
        if (!childSteps) {
            result.push({
                address: `${addressCollector}${stepName}`,
                canGoBack: canGoBack ?? defaultCanGoBack,
                ...(shouldSkip && {shouldSkip})
            })
        }

        // 2. traverse left subtree
        if (childSteps) {
            recurTraverse(
                childSteps.initialStep,
                childSteps,
                `${addressCollector}${stepName}${NAME_ADDRESS_DELIMITER}`
            )
        }
        // 3. traverse right subtree
        if (next) {
            recurTraverse(next, subtree, addressCollector)
        }
    }
    recurTraverse(steps.initialStep, steps)
    return result
}

export const useStepper = <StepNames extends string = string>(
    steps: Steps<StepNames>,
    initialStep = steps.initialStep
): {
    isLoading: boolean
    currentStep: SequentialStep
    goToNextStep: () => void
    goToPrevStep: () => void
} => {
    const stepsSequence = generateArrayFromTree(steps)
    const findStepByAddress = (address: string) =>
        stepsSequence.find((step) => step.address === address)
    const [currentStep, setCurrentStep] = useState<SequentialStep | null>(null)

    useEffect(() => {
        calculateFirstStep(steps, initialStep)
            .then((address) => {
                setCurrentStep(findStepByAddress(address) || null)
            })
            .catch((err) => {
                console.error(err)
            })
    }, [])

    const goToNextStep = async (_currentStep = currentStep) => {
        const currentStepIndex = stepsSequence.findIndex(
            (step) => step.address === _currentStep?.address
        )
        const isValidIndex = currentStepIndex >= 0 && currentStepIndex < stepsSequence.length - 1
        if (isValidIndex) {
            const nextStep = stepsSequence[currentStepIndex + 1]
            const shouldSkip = (await nextStep.shouldSkip?.()) ?? false
            if (shouldSkip) {
                await goToNextStep(nextStep)
            } else {
                setCurrentStep(nextStep)
            }
        }
    }

    const goToPrevStep = async (_currentStep = currentStep) => {
        const currentStepIndex = stepsSequence.findIndex(
            (step) => step.address === _currentStep?.address
        )
        const isValidIndex = currentStepIndex > 0 && currentStepIndex < stepsSequence.length
        const canGoBack = _currentStep?.canGoBack
        if (isValidIndex && canGoBack) {
            const prevStep = stepsSequence[currentStepIndex - 1]
            const shouldSkip = (await prevStep.shouldSkip?.()) ?? false
            if (shouldSkip) {
                await goToPrevStep(prevStep)
            } else {
                setCurrentStep(prevStep)
            }
        }
    }

    return {
        isLoading: !currentStep,
        currentStep: currentStep as SequentialStep,
        goToNextStep: () => goToNextStep(),
        goToPrevStep: () => goToPrevStep()
    }
}
