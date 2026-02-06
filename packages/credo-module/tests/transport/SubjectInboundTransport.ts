import type { AgentContext } from '@credo-ts/core'
import { utils } from '@credo-ts/core'
import {
  type DidCommEncryptedMessage,
  type DidCommInboundTransport,
  DidCommMessageReceiver,
  DidCommTransportService,
  type DidCommTransportSession,
} from '@credo-ts/didcomm'
import type { Subscription } from 'rxjs'
import { Subject } from 'rxjs'

export type SubjectMessage = { message: DidCommEncryptedMessage; replySubject?: Subject<SubjectMessage> }

export class SubjectInboundTransport implements DidCommInboundTransport {
  public readonly ourSubject: Subject<SubjectMessage>
  private subscription?: Subscription

  public constructor(ourSubject = new Subject<SubjectMessage>()) {
    this.ourSubject = ourSubject
  }

  public async start(agentContext: AgentContext) {
    this.subscribe(agentContext)
  }

  public async stop() {
    this.subscription?.unsubscribe()
  }

  private subscribe(agent: AgentContext) {
    const logger = agent.config.logger
    const transportService = agent.dependencyManager.resolve(DidCommTransportService)
    const messageReceiver = agent.dependencyManager.resolve(DidCommMessageReceiver)

    this.subscription = this.ourSubject.subscribe({
      next: async ({ message, replySubject }: SubjectMessage) => {
        logger.test('Received message')

        let session: SubjectTransportSession | undefined
        if (replySubject) {
          session = new SubjectTransportSession(`subject-session-${utils.uuid()}`, replySubject)

          // When the subject is completed (e.g. when the session is closed), we need to
          // remove the session from the transport service so it won't be used for sending messages
          // in the future.
          replySubject.subscribe({
            complete: () => session && transportService.removeSession(session),
          })
        }

        await messageReceiver.receiveMessage(message, { session })
      },
    })
  }
}

export class SubjectTransportSession implements DidCommTransportSession {
  public id: string
  public readonly type = 'subject'
  private replySubject: Subject<SubjectMessage>

  public constructor(id: string, replySubject: Subject<SubjectMessage>) {
    this.id = id
    this.replySubject = replySubject
  }

  public async send(agentContext: AgentContext, encryptedMessage: DidCommEncryptedMessage): Promise<void> {
    this.replySubject.next({ message: encryptedMessage })
  }

  public async close(): Promise<void> {
    this.replySubject.complete()
  }
}
