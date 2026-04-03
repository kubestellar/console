export interface NamespaceDetails {
  name: string
  cluster: string
  status: string
  labels?: Record<string, string>
  created_at: string
}

export interface NamespaceAccessEntry {
  bindingName: string
  subjectKind: string
  subjectName: string
  subjectNamespace?: string
  roleName: string
  roleKind: string
}
