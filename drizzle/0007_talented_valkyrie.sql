CREATE TABLE `gmail_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`encryptedRefreshToken` text NOT NULL,
	`scopes` text NOT NULL,
	`connectedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gmail_connections_id` PRIMARY KEY(`id`),
	CONSTRAINT `gmail_connections_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `gmail_connections` ADD CONSTRAINT `gmail_connections_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;