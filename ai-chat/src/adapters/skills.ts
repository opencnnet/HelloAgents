import { invoke } from '@tauri-apps/api/core'

import { isTauri } from '@/adapters/env'
import { agentSkillsUrl } from '@/adapters/transport/protocol'

export interface SkillSummary {
  name: string
  description: string
}

export interface SkillDraft {
  name: string
  description: string
  content: string
  overwrite: boolean
}

async function parse<T>(response: Response): Promise<T> {
  const text = await response.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = text
    }
  }
  if (!response.ok) {
    const detail =
      payload && typeof payload === 'object' && 'detail' in payload
        ? String((payload as { detail: unknown }).detail)
        : typeof payload === 'string' && payload
          ? payload
          : `HTTP ${response.status}`
    throw new Error(detail)
  }
  return payload as T
}

export async function listSkills(endpoint: string): Promise<SkillSummary[]> {
  if (isTauri) {
    const raw = await invoke<string>('skills_list', { endpoint })
    const data = raw ? (JSON.parse(raw) as { skills?: SkillSummary[] }) : {}
    return data.skills ?? []
  }
  const response = await fetch(agentSkillsUrl(endpoint), {
    headers: { Accept: 'application/json' },
  })
  const data = await parse<{ skills: SkillSummary[] }>(response)
  return data.skills ?? []
}

export async function createSkill(endpoint: string, draft: SkillDraft): Promise<void> {
  if (isTauri) {
    await invoke('skills_create', { endpoint, draft })
    return
  }
  const response = await fetch(agentSkillsUrl(endpoint), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  })
  await parse(response)
}

export async function uploadSkill(
  endpoint: string,
  file: File,
  overwrite: boolean,
): Promise<void> {
  if (isTauri) {
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()))
    await invoke('skills_upload', { endpoint, fileName: file.name, bytes, overwrite })
    return
  }
  const form = new FormData()
  form.append('file', file)
  const response = await fetch(
    `${agentSkillsUrl(endpoint)}/upload?overwrite=${overwrite ? 'true' : 'false'}`,
    { method: 'POST', body: form },
  )
  await parse(response)
}

export async function deleteSkill(endpoint: string, name: string): Promise<void> {
  if (isTauri) {
    await invoke('skills_delete', { endpoint, name })
    return
  }
  const response = await fetch(`${agentSkillsUrl(endpoint)}/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  })
  await parse(response)
}
