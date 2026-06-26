import { useState } from 'react'
import { useToast } from '../ui/Toast'
import {
  loadWatchedRepos,
  saveWatchedRepos,
  loadWatchedPaths,
  saveWatchedPaths,
} from './missionBrowserConstants'

export function useMissionWatchedSources() {
  const { showToast } = useToast()
  const [watchedRepos, setWatchedRepos] = useState<string[]>(loadWatchedRepos)
  const [watchedPaths, setWatchedPaths] = useState<string[]>(loadWatchedPaths)
  const [addingRepo, setAddingRepo] = useState(false)
  const [addingPath, setAddingPath] = useState(false)
  const [newRepoValue, setNewRepoValue] = useState('')
  const [newPathValue, setNewPathValue] = useState('')

  const handleAddRepo = (value: string) => {
    const updated = [...watchedRepos, value]
    setWatchedRepos(updated)
    saveWatchedRepos(updated)
    showToast(`Added repository "${value}"`, 'success')
  }

  const handleRemoveRepo = (path: string) => {
    const updated = watchedRepos.filter((repo) => repo !== path)
    setWatchedRepos(updated)
    saveWatchedRepos(updated)
    showToast(`Removed repository "${path}"`, 'info')
  }

  const handleAddPath = (value: string) => {
    const updated = [...watchedPaths, value]
    setWatchedPaths(updated)
    saveWatchedPaths(updated)
    showToast(`Added path "${value}"`, 'success')
  }

  const handleRemovePath = (path: string) => {
    const updated = watchedPaths.filter((watchedPath) => watchedPath !== path)
    setWatchedPaths(updated)
    saveWatchedPaths(updated)
    showToast(`Removed path "${path}"`, 'info')
  }

  return {
    watchedRepos,
    watchedPaths,
    addingRepo,
    setAddingRepo,
    newRepoValue,
    setNewRepoValue,
    addingPath,
    setAddingPath,
    newPathValue,
    setNewPathValue,
    handleAddRepo,
    handleRemoveRepo,
    handleAddPath,
    handleRemovePath,
  }
}
