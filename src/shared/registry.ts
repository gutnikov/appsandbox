/**
 * Аудитория OIDC-удостоверения, которое сборка сэндбокса запрашивает у
 * GitHub. Значение — часть контракта шаблона: workflow просит удостоверение
 * ровно с этой аудиторией, платформа ровно её и проверяет.
 */
export const OIDC_AUDIENCE = 'zerotomvp'

/** Издатель удостоверений GitHub Actions. */
export const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com'

/** Сколько живёт токен, выдаваемый реестру. Хватает на публикацию образа. */
export const REGISTRY_TOKEN_TTL_SECONDS = 300
