# VirtualPC + Microsoft-stack

Dit document beschrijft hoe VirtualPC samenwerkt met Microsoft Copilot, Microsoft 365, Azure en de bijbehorende services. VirtualPC is geen vervanger van Copilot, maar een autonome backend-laag die Copilot-acties end-to-end kan uitvoeren.

---

## 1. Positionering

| Laag | Product | Wat het doet |
|------|---------|--------------|
| **User-facing AI** | Microsoft 365 Copilot, Copilot in Teams/Outlook | Snelle antwoorden, samenvattingen, chat, ideeëngeneratie |
| **Process automation** | Power Automate, Logic Apps | Triggeren van workflows op events |
| **Multi-agent OS** | **VirtualPC** | Autonome agenten met geheugen, takenmotor, governance en menselijke goedkeuring |
| **Models** | Azure OpenAI, Ollama (op Azure VM/Vultr) | LLM-backend via LiteLLM-gateway |

Copilot vraagt, VirtualPC voert uit, Microsoft 365 blijft de werkplek.

---

## 2. Authenticatie via Microsoft Entra ID (Azure AD)

VirtualPC ondersteunt JWT-gebaseerde login. Je kunt Entra ID als identity provider gebruiken:

1. Registreer een app in **Microsoft Entra admin center**.
2. Configureer **OIDC** of **SAML** als login-methode.
3. Map Entra-groepen naar VirtualPC-rollen in `.env`:

```bash
# .env
AUTH_PROVIDER=entra-id
ENTRA_CLIENT_ID=<uuid>
ENTRA_CLIENT_SECRET=<secret>
ENTRA_TENANT_ID=<uuid>
ENTRA_REDIRECT_URI=https://vpc.example.com/auth/callback

# Groep -> rol mapping (JSON)
ROLE_MAP='{"admin-group":"admin","analyst-group":"analyst","viewer-group":"viewer"}'
```

4. VirtualPC leest de `groups`-claim en kent het dashboard toe op basis van `ROLE_MAP`.

---

## 3. Microsoft Graph API

VirtualPC kan via de Graph API lezen en schrijven in Microsoft 365.

### Vereiste permissies (application of delegated)

| Resource | Lezen | Schrijven |
|----------|-------|-----------|
| Teams-berichten | `ChannelMessage.Read.All` | `ChannelMessage.Send` |
| SharePoint / OneDrive | `Files.Read.All` | `Files.ReadWrite.All` |
| Outlook-mail | `Mail.Read` | `Mail.Send` |
| Agenda | `Calendars.Read` | `Calendars.ReadWrite` |
| Gebruikers/groepen | `User.Read.All`, `Group.Read.All` | — |

### Voorbeeld: SharePoint-bestand inlezen

```bash
# 1. Token ophalen (client credentials flow)
TOKEN=$(curl -X POST https://login.microsoftonline.com/$TENANT/oauth2/v2.0/token \
  -d "client_id=$CLIENT" \
  -d "scope=https://graph.microsoft.com/.default" \
  -d "client_secret=$SECRET" \
  -d "grant_type=client_credentials" | jq -r .access_token)

# 2. Bestand downloaden via drive-id en item-id
curl -H "Authorization: Bearer $TOKEN" \
  "https://graph.microsoft.com/v1.0/drives/$DRIVE/items/$ITEM/content" \
  -o dataset.csv
```

De Analyst-agent kan vervolgens `dataset.csv` verwerken. Governor registreert de bron in de lineage-registry.

---

## 4. Azure OpenAI als modelprovider

VirtualPC routeert alles via LiteLLM. Voeg Azure OpenAI toe als cloud-fallback:

```yaml
# deploy/litellm-config.yaml
model_list:
  - model_name: gpt-4o
    litellm_params:
      model: azure/gpt-4o
      api_base: https://<your-resource>.openai.azure.com/
      api_key: os.environ/AZURE_OPENAI_API_KEY
      api_version: 2024-08-01-preview
```

Zet de key in `~/.virtualpc/llm-keys.env`:

```bash
AZURE_OPENAI_API_KEY=<key>
```

Zo blijft de agent-code hetzelfde, ongeacht of er lokaal (Ollama) of in Azure wordt geïnferd.

---

## 5. Copilot Studio actie

Je kunt VirtualPC als custom skill aan Copilot Studio koppelen.

1. Maak in Copilot Studio een **custom action** aan.
2. Gebruik het OpenAPI-schema van VirtualPC (`public/openapi.json`) of een subset ervan.
3. Koppel de actie aan een topic, bijvoorbeeld: *"Maak een verkoopanalyse"*.
4. Copilot roept `/api/tasks` aan met het prompt:

```json
{
  "agent": "Analyst",
  "title": "Verkoopanalyse Q3",
  "description": "Analyseer de omzetgegevens uit SharePoint en post een dashboard terug naar Teams.",
  "context": { "source": "sharepoint", "drive_id": "...", "item_id": "..." }
}
```

5. VirtualPC voert de taak uit en retourneert een URL naar het resultaat-dashboard.

---

## 6. Power Automate / Logic Apps

Trigger VirtualPC vanuit Microsoft 365-events.

### Voorbeeld: wanneer een SharePoint-bestand wordt gewijzigd

1. Power Automate flow:
   - Trigger: **When a file is created or modified (properties only)**
   - Actie: **HTTP POST**
2. HTTP-body:

```json
{
  "event": "sharepoint.file.changed",
  "webUrl": "@{triggerOutputs()?['body/LinkToItem']}",
  "driveId": "@{triggerOutputs()?['body/{DriveId}']}",
  "itemId": "@{triggerOutputs()?['body/{ItemId}']}",
  "requestedBy": "@{triggerOutputs()?['body/Editor/DisplayName']}"
}
```

3. Endpoint: `POST https://vpc.example.com/api/tasks`
4. VirtualPC start Governor + Analyst en schrijft het resultaat terug via Graph.

---

## 7. Azure DevOps / GitHub

VirtualPC-agenten kunnen net als menselijke ontwikkelaars werken:

- **Zip / Pixel** openen PR’s via de GitHub/Azure DevOps API.
- **Athena** reviewt elke PR op coding standards.
- **Kai** koppelt work items aan taken via `scrum.bug` en `scrum.standup`.

Configureer een PAT in `~/.virtualpc/llm-keys.env`:

```bash
AZURE_DEVOPS_TOKEN=<pat>
GITHUB_TOKEN=<pat>
```

---

## 8. Deployment op Azure

### Optie A: Azure VM (snelste)

1. Maak een VM aan (minimaal 4 vCPU / 16 GB RAM, optioneel GPU).
2. SSH in en volg `docs/DEPLOY-VULTR.md` (vervang Vultr door Azure-stappen).
3. Optioneel: gebruik Azure OpenAI in plaats van Ollama.

### Optie B: Azure Container Instances / AKS

Gebruik de bestaande Docker-images:

```yaml
# excerpt voor AKS
apiVersion: apps/v1
kind: Deployment
metadata:
  name: virtualpc
spec:
  replicas: 1
  selector:
    matchLabels:
      app: virtualpc
  template:
    metadata:
      labels:
        app: virtualpc
    spec:
      containers:
        - name: virtualpc
          image: ghcr.io/virtuanalytica/virtualpc:latest
          env:
            - name: LITELLM_URL
              value: "http://litellm:4000"
```

> Let op: VirtualPC gebruikt `systemd` voor auto-update. In containers vervang je dat door een Kubernetes CronJob of Azure DevOps-pipeline.

---

## 9. Data residency en beveiliging

- Draai VirtualPC in je eigen Azure-tenant of op eigen hardware.
- Gebruik **private endpoints** voor Azure OpenAI.
- Sla geheimen op in Azure Key Vault en mount deze als omgevingsvariabelen.
- Alle agent-acties worden gelogd; koppel deze aan Azure Monitor / Log Analytics.
- Deliberation gates zorgen dat gevoelige acties menselijke goedkeuring vereisen.

---

## 10. Meer informatie

- `public/microsoft-blend.html` — visuele pitch voor niet-technische stakeholders
- `docs/API-ENDPOINTS.md` — routes die Copilot Studio en Power Automate aanroepen
- `docs/DATA-SCIENCE-WIKI.md` — data-science voorbeelden binnen VirtualPC
- `docs/DEPLOY-VULTR.md` — deployment-gids (ook toepasbaar op Azure VM)
