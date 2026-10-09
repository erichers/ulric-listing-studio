FROM node:22-bookworm AS web
WORKDIR /src/web
COPY src/Ulric.Web/package.json src/Ulric.Web/package-lock.json ./
RUN npm ci
COPY src/Ulric.Web/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS api
WORKDIR /src
COPY Ulric.sln ./
COPY src/Ulric.Api/ src/Ulric.Api/
RUN dotnet publish src/Ulric.Api/Ulric.Api.csproj -c Release -o /out

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=api /out ./
COPY --from=web /src/web/dist/ulric-web/browser ./wwwroot
ENV ASPNETCORE_URLS=http://0.0.0.0:8080
ENV ASPNETCORE_ENVIRONMENT=Production
ENV ConnectionStrings__Ulric=Data Source=/data/ulric.db
ENV Storage__Root=/data/uploads
VOLUME /data
EXPOSE 8080
ENTRYPOINT ["dotnet", "Ulric.Api.dll"]
