import { Routes } from '@angular/router';
import { BuilderPage } from './pages/builder';
import { DashboardPage } from './pages/dashboard';
import { HomePage } from './pages/home';
import { MicrositePage } from './pages/microsite';
import { NotFoundPage } from './pages/not-found';

export const routes: Routes = [
  { path: '', component: HomePage },
  { path: 'builder', component: BuilderPage },
  { path: 'builder/:id', component: BuilderPage },
  { path: 'dashboard', component: DashboardPage },
  { path: 'p/:slug', component: MicrositePage },
  { path: '**', component: NotFoundPage },
];
