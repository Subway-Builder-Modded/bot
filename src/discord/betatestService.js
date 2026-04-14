const { ChannelType, PermissionsBitField } = require('discord.js');
const {
  BETA_TESTING_CATEGORY_ID,
  BETATEST_CREATE_CHANNEL_ID,
  COLLABORATOR_ROLE_ID,
  MAPPER_ROLE_ID,
  MOD_ROLE_ID,
  MODDER_ROLE_ID,
} = require('../constants');

const KEBAB_CASE_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function normalizeRoleName(name) {
  return String(name || '').trim().toLowerCase();
}

function memberHasRoleId(member, roleId) {
  return Boolean(member?.roles?.cache?.has?.(roleId));
}

function memberHasRoleName(member, roleName) {
  const expected = normalizeRoleName(roleName);
  return Boolean(member?.roles?.cache?.some?.((role) => normalizeRoleName(role.name) === expected));
}

function createBetatestService() {
  async function fetchMember(guild, userId, fallbackMember) {
    if (fallbackMember?.id === userId && fallbackMember?.roles?.cache) {
      return fallbackMember;
    }
    return guild.members.fetch(userId);
  }

  function requireKebabCase(projectId) {
    if (!KEBAB_CASE_REGEX.test(projectId)) {
      throw new Error('Project id must be kebab-case (lowercase letters, numbers, and hyphens).');
    }
  }

  async function findRoleByName(guild, roleName) {
    if (!guild.roles.cache.size) {
      await guild.roles.fetch();
    }
    return guild.roles.cache.find((role) => normalizeRoleName(role.name) === normalizeRoleName(roleName)) || null;
  }

  async function createProject(interaction, projectId) {
    if (!interaction.guild) {
      throw new Error('This command can only be used in a server.');
    }

    if (interaction.channelId !== BETATEST_CREATE_CHANNEL_ID) {
      throw new Error(`This command can only be used in <#${BETATEST_CREATE_CHANNEL_ID}>.`);
    }

    requireKebabCase(projectId);

    const callerMember = await fetchMember(interaction.guild, interaction.user.id, interaction.member);
    const canCreate =
      memberHasRoleId(callerMember, MAPPER_ROLE_ID) ||
      memberHasRoleId(callerMember, MODDER_ROLE_ID) ||
      memberHasRoleId(callerMember, COLLABORATOR_ROLE_ID);

    if (!canCreate) {
      throw new Error('Only Mapper, Modder, or Collaborator members can use /betatest create.');
    }

    const existingProjectChannel = interaction.guild.channels.cache.find(
      (channel) => channel.parentId === BETA_TESTING_CATEGORY_ID && channel.name === projectId
    );

    if (existingProjectChannel) {
      throw new Error(`A beta test project with id "${projectId}" already exists.`);
    }

    const adminRoleName = `bt-${projectId}-admin`;
    const memberRoleName = `bt-${projectId}`;

    let adminRole = await findRoleByName(interaction.guild, adminRoleName);
    if (!adminRole) {
      adminRole = await interaction.guild.roles.create({
        name: adminRoleName,
        reason: `Beta test admin role for project ${projectId}`,
      });
    }

    let memberRole = await findRoleByName(interaction.guild, memberRoleName);
    if (!memberRole) {
      memberRole = await interaction.guild.roles.create({
        name: memberRoleName,
        reason: `Beta test member role for project ${projectId}`,
      });
    }

    await callerMember.roles.add([adminRole.id, memberRole.id], `Created beta test project ${projectId}`);

    const category = await interaction.guild.channels.fetch(BETA_TESTING_CATEGORY_ID);
    if (!category || category.type !== ChannelType.GuildCategory) {
      throw new Error('The Beta Testing category is missing or not a category channel.');
    }

    const channel = await interaction.guild.channels.create({
      name: projectId,
      type: ChannelType.GuildText,
      parent: BETA_TESTING_CATEGORY_ID,
      permissionOverwrites: [
        {
          id: interaction.guild.roles.everyone.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: adminRole.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
          ],
        },
        {
          id: memberRole.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
          ],
        },
        {
          id: COLLABORATOR_ROLE_ID,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
          ],
        },
        {
          id: MOD_ROLE_ID,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
          ],
        },
      ],
      topic: `Beta test project: ${projectId}`,
      reason: `Beta test channel for project ${projectId}`,
    });

    return {
      channel,
      adminRole,
      memberRole,
    };
  }

  async function addUserToProject(interaction, projectId, targetUserId) {
    if (!interaction.guild) {
      throw new Error('This command can only be used in a server.');
    }

    requireKebabCase(projectId);

    if (!/^\d{17,20}$/.test(targetUserId)) {
      throw new Error('User id must be a valid Discord snowflake.');
    }

    const callerMember = await fetchMember(interaction.guild, interaction.user.id, interaction.member);
    const expectedAdminRoleName = `bt-${projectId}-admin`;

    const canManage =
      memberHasRoleId(callerMember, MOD_ROLE_ID) ||
      memberHasRoleId(callerMember, COLLABORATOR_ROLE_ID) ||
      memberHasRoleName(callerMember, expectedAdminRoleName);

    if (!canManage) {
      throw new Error('Only Mods, Collaborators, or project admins can use /betatest add for this project.');
    }

    const projectChannel = interaction.guild.channels.cache.find(
      (channel) => channel.parentId === BETA_TESTING_CATEGORY_ID && channel.name === projectId
    );

    if (!projectChannel) {
      throw new Error(`Could not find beta test channel "${projectId}" in the Beta Testing category.`);
    }

    const memberRoleName = `bt-${projectId}`;
    const memberRole = await findRoleByName(interaction.guild, memberRoleName);

    if (!memberRole) {
      throw new Error(`Could not find role "${memberRoleName}" for this project.`);
    }

    const targetMember = await fetchMember(interaction.guild, targetUserId, null);
    await targetMember.roles.add(memberRole.id, `Added to beta test project ${projectId}`);

    return {
      projectChannel,
      memberRole,
      targetMember,
    };
  }

  async function removeUserFromProject(interaction, projectId, targetUserId) {
    if (!interaction.guild) {
      throw new Error('This command can only be used in a server.');
    }

    requireKebabCase(projectId);

    if (!/^\d{17,20}$/.test(targetUserId)) {
      throw new Error('User id must be a valid Discord snowflake.');
    }

    const callerMember = await fetchMember(interaction.guild, interaction.user.id, interaction.member);
    const expectedAdminRoleName = `bt-${projectId}-admin`;

    const canManage =
      memberHasRoleId(callerMember, MOD_ROLE_ID) ||
      memberHasRoleId(callerMember, COLLABORATOR_ROLE_ID) ||
      memberHasRoleName(callerMember, expectedAdminRoleName);

    if (!canManage) {
      throw new Error('Only Mods, Collaborators, or project admins can use /betatest remove for this project.');
    }

    const projectChannel = interaction.guild.channels.cache.find(
      (channel) => channel.parentId === BETA_TESTING_CATEGORY_ID && channel.name === projectId
    );

    if (!projectChannel) {
      throw new Error(`Could not find beta test channel "${projectId}" in the Beta Testing category.`);
    }

    const memberRoleName = `bt-${projectId}`;
    const memberRole = await findRoleByName(interaction.guild, memberRoleName);

    if (!memberRole) {
      throw new Error(`Could not find role "${memberRoleName}" for this project.`);
    }

    const targetMember = await fetchMember(interaction.guild, targetUserId, null);
    await targetMember.roles.remove(memberRole.id, `Removed from beta test project ${projectId}`);

    return {
      projectChannel,
      memberRole,
      targetMember,
    };
  }

  async function deleteProject(interaction, projectId) {
    if (!interaction.guild) {
      throw new Error('This command can only be used in a server.');
    }

    requireKebabCase(projectId);

    const callerMember = await fetchMember(interaction.guild, interaction.user.id, interaction.member);
    const expectedAdminRoleName = `bt-${projectId}-admin`;

    const canDelete =
      memberHasRoleId(callerMember, MOD_ROLE_ID) ||
      memberHasRoleName(callerMember, expectedAdminRoleName);

    if (!canDelete) {
      throw new Error('Only Mods or the project admin can use /betatest delete for this project.');
    }

    const projectChannel = interaction.guild.channels.cache.find(
      (channel) => channel.parentId === BETA_TESTING_CATEGORY_ID && channel.name === projectId
    );

    if (!projectChannel) {
      throw new Error(`Could not find beta test channel "${projectId}" in the Beta Testing category.`);
    }

    const adminRoleName = `bt-${projectId}-admin`;
    const memberRoleName = `bt-${projectId}`;

    const adminRole = await findRoleByName(interaction.guild, adminRoleName);
    const memberRole = await findRoleByName(interaction.guild, memberRoleName);

    await projectChannel.delete('Beta test project deleted');

    if (adminRole) {
      await adminRole.delete('Beta test project deleted');
    }
    if (memberRole) {
      await memberRole.delete('Beta test project deleted');
    }

    return {
      projectId,
    };
  }

  return {
    addUserToProject,
    createProject,
    deleteProject,
    removeUserFromProject,
  };
}

module.exports = {
  createBetatestService,
};
