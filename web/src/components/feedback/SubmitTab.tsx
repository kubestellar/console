import { useState, useCallback, useEffect } from 'react'
import {
  Bug, Sparkles, ExternalLink,
  Eye, Pencil, Settings, Maximize2,
  AlertTriangle, Monitor, BookOpen, FileText, Lock,
} from 'lucide-react'
import { Github } from '@/lib/icons'
import { cn } from '@/lib/cn'
import { Button } from '../ui/Button'
import { isDemoModeForced } from '../../lib/demoMode'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants'
import { api } from '../../lib/api'
import { FEEDBACK_UPLOAD_TIMEOUT_MS } from '../../lib/constants/network'
import { GITHUB_TOKEN_CREATE_URL, GITHUB_TOKEN_FINE_GRAINED_PERMISSIONS } from '../../lib/constants/github-token'
import { compressScreenshot } from '../../lib/imageCompression'
import { useToast } from '../ui/Toast'
import { useTranslation } from 'react-i18next'
import { useBackendHealth } from '../../hooks/useBackendHealth'
import { useKagentBackend } from '../../hooks/useKagentBackend'
import { sanitizeUrl } from '@/lib/utils/sanitizeUrl'

import { LazyMarkdown as ReactMarkdown } from '../ui/LazyMarkdown'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeSanitize from 'rehype-sanitize'
