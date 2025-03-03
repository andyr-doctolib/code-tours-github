import { Request } from '../types/request'
import { Response } from '../types/response'
import { CodeTour, EnhancedCodeTourStep } from '../types/code-tour'
import MessageSender = chrome.runtime.MessageSender

const codeTourMap: Record<string, CodeTourGenerator> = {}

class CodeTourGenerator {
  constructor(private body: CodeTour) {}

  goTo(step: number): string {
    const newStep = this.body.steps[step]
    if (!newStep) throw new Error('Unknown step')

    if ('file' in newStep && newStep.file) {
      return `http://github.com/${this.body.repository}/blob/${this.getDefaultRef()}/${
        newStep.file
      }?step=${step}&code-tour=${this.body.slang}`
    }

    if ('directory' in newStep && newStep.directory) {
      return `http://github.com/${this.body.repository}/tree/${this.getDefaultRef()}/${
        newStep.directory
      }?step=${step}&code-tour=${this.body.slang}`
    }

    return `http://github.com/${this.body.repository}/tree/${this.getDefaultRef()}/?step=${step}&code-tour=${
      this.body.slang
    }`
  }

  // TODO real implementation
  private getDefaultRef() {
    return this.body.ref || 'main'
  }

  getStep(stepId: number): EnhancedCodeTourStep {
    const requestedStep = this.body.steps[stepId]
    if (!requestedStep) throw new Error('step does not exist')

    let previousUrl
    try {
      previousUrl = this.goTo(stepId - 1)
    } catch (error) {
      // no impacts
    }
    let nextUrl
    try {
      nextUrl = this.goTo(stepId + 1)
    } catch (error) {
      // no impacts
    }
    return {
      ...requestedStep,
      nextUrl,
      previousUrl,
      tour: this.body,
    }
  }
}

chrome.runtime.onMessage.addListener(function (
  request: Request,
  sender: MessageSender,
  sendResponse: (answer: Response) => void,
): boolean {
  if ('codeTour' in request) {
    request.codeTour.slang = request.codeTour.title.replace(/[^a-z0-9]/gi, '')
  }
  switch (request.action) {
    case 'START':
      codeTourMap[request.codeTour.slang] = new CodeTourGenerator(request.codeTour)
      sendResponse({ action: 'REDIRECT', url: codeTourMap[request.codeTour.slang].goTo(0) })
      break
    case 'GO_TO':
      if (!codeTourMap[request.codeTour.slang]) return false
      if (!request.codeTour.step) return false
      sendResponse({ action: 'REDIRECT', url: codeTourMap[request.codeTour.slang].goTo(request.codeTour.step) })
      break
    case 'GET_STEP': {
      const step = codeTourMap[request.codeTourTitle]?.getStep(request.codeTourStep)
      if (!step) return false
      sendResponse({ action: 'STEP', step })
      break
    }
    case 'GET_CODE_TOUR': {
      void fetch(`https://github.com${request.url}`)
        .then((response) => response.json())
        .then((codeTourContent: CodeTour) => sendResponse({ action: 'CODE_TOUR', codeTour: codeTourContent }))
      return true
    }
  }
  return false
})
