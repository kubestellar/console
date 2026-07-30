import * as moduleExports from '../trivy-scan'
import { registerCardConfigTest } from './card-config-test-helpers'

registerCardConfigTest('trivy-scan', moduleExports)
