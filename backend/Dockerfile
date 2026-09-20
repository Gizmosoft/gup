# syntax=docker/dockerfile:1

# ─── Build ────────────────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jdk-jammy AS build

WORKDIR /workspace

# Layer cache: resolve dependencies before copying sources.
COPY mvnw pom.xml ./
COPY .mvn .mvn
RUN chmod +x mvnw \
	&& ./mvnw -B -DskipTests dependency:resolve

COPY src src
RUN ./mvnw -B -DskipTests package \
	&& mv target/bakbak-*.jar target/app.jar

# ─── Runtime ─────────────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-jammy AS runtime

WORKDIR /app

RUN groupadd --system --gid 10001 spring \
	&& useradd --system --uid 10001 --gid spring --home-dir /app --shell /usr/sbin/nologin spring

COPY --from=build --chown=spring:spring /workspace/target/app.jar /app/app.jar

USER spring:spring

EXPOSE 8080

# Homelab / prod default. Override at runtime if needed.
ENV SPRING_PROFILES_ACTIVE=prod \
	JAVA_OPTS="-XX:MaxRAMPercentage=75.0 -XX:+UseG1GC"

# Required at runtime (see .env.example): JWT_SECRET, DB_URL, DB_USER, DB_PASS,
# S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET (and optional S3_REGION, CORS_*).
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
