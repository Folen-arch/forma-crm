"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, LockKeyhole, Mail, Sparkles } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const result = mode === "sign-up"
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password, callbackURL: "/" })
        : await authClient.signIn.email({ email: email.trim(), password, callbackURL: "/" });
      if (result.error) {
        setError(result.error.message || "Не удалось войти. Проверьте данные и попробуйте ещё раз.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Не удалось связаться с сервером. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  };

  const switchMode = () => {
    setMode((current) => current === "sign-in" ? "sign-up" : "sign-in");
    setError("");
  };

  return (
    <main className="auth-page">
      <section className="auth-showcase">
        <div className="auth-brand"><span className="brand-mark"><i /><i /><i /></span><span>forma<span>.</span></span></div>
        <div className="auth-showcase-copy"><span className="auth-eyebrow"><Sparkles size={14} />РАБОТА В РАВНОВЕСИИ</span><h1>Всё важное<br />в одном месте.</h1><p>Клиенты, проекты и финансы — пространство для спокойной и собранной работы.</p></div>
        <div className="auth-showcase-footer"><span><Check size={14} />Простое рабочее пространство</span><span>FORMA STUDIO · 2026</span></div>
        <div className="auth-decoration auth-decoration-one" /><div className="auth-decoration auth-decoration-two" />
      </section>
      <section className="auth-form-side">
        <div className="auth-form-wrap">
          <span className="auth-form-icon"><LockKeyhole size={18} /></span>
          <p className="auth-eyebrow">ВАШЕ РАБОЧЕЕ ПРОСТРАНСТВО</p>
          <h2>{mode === "sign-in" ? "С возвращением" : "Создайте аккаунт"}</h2>
          <p className="auth-subtitle">{mode === "sign-in" ? "Войдите, чтобы продолжить работу в Forma." : "Начните вести проекты и клиентов в Forma."}</p>
          <form className="auth-form" onSubmit={submit}>
            {mode === "sign-up" && <label className="auth-field"><span>Ваше имя</span><input autoComplete="name" required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, Олена Шевченко" /></label>}
            <label className="auth-field"><span>Электронная почта</span><span className="auth-input-wrap"><Mail size={16} /><input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></span></label>
            <label className="auth-field"><span>Пароль</span><span className="auth-input-wrap"><LockKeyhole size={16} /><input type="password" autoComplete={mode === "sign-up" ? "new-password" : "current-password"} required minLength={mode === "sign-up" ? 10 : 1} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "sign-up" ? "Не менее 10 символов" : "Введите пароль"} /></span></label>
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="auth-submit" type="submit" disabled={pending}>{pending ? "Подождите…" : mode === "sign-in" ? "Войти" : "Создать аккаунт"}<ArrowRight size={17} /></button>
          </form>
          <p className="auth-switch">{mode === "sign-in" ? "Впервые в Forma?" : "Уже есть аккаунт?"}<button type="button" onClick={switchMode}>{mode === "sign-in" ? "Зарегистрироваться" : "Войти"}</button></p>
          <p className="auth-privacy">Ваши данные доступны только в вашем рабочем пространстве.</p>
        </div>
      </section>
    </main>
  );
}
